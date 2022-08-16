import axios from 'axios';
import { auth0MgmtConfig, auth0ClientConfig } from '../../config';
import User from '../models/User';

/**
 * fetch and check whether current access_token (in auth0) has expired
 * return a new valid token if it has
 * uses `auth0UserID` which is the `user.sub` string from user's metadata in auth0
 */
export async function getGApiAccessToken(userID, auth0UserID) {
  // get our management access token
  const { data: tokenData } = await axios({
    method: 'post',
    url: `https://${auth0ClientConfig.domain}/oauth/token`,
    data: auth0MgmtConfig,
    headers: { 'content-type': 'application/json' }
  });

  //  use management access token to get user's metadata
  const userMeta = await axios({
    method: 'get',
    url: `https://${auth0ClientConfig.domain}/api/v2/users/${auth0UserID}`,
    data: auth0MgmtConfig,
    headers: {
      Authorization: 'Bearer ' + tokenData.access_token
    }
  });

  // extract user's google api access and refresh token from their metadata
  let { access_token: googleToken, refresh_token } = userMeta.data?.identities?.find(
    item => item.provider === 'google-oauth2'
  );

  // if auth0 has `refresh_token`, this means the previous token expired
  if (refresh_token) {
    // replace token in db
    await User.updateOne({ _id: userID }, { gDriveApiRefreshToken: refresh_token });
  } else {
    // if not, this means the prev token still works. Use it
    const user = await User.findOne({ _id: userID }).lean(true);
    refresh_token = user.gDriveApiRefreshToken;
  }

  // if token is invalid or
  // if token is valid but token's scope doesn't include drive read-only
  // this means the user has granted drive read-only access, but token scope was overwritten by recent login
  // request a new access token using refresh token
  const tokenInfo = await getGApiTokenInfo(googleToken);
  if (
    (await hasGApiTokenExpired(googleToken)) ||
    !tokenInfo.scope.includes('https://www.googleapis.com/auth/drive.readonly')
  ) {
    const { data: responseData } = await axios({
      method: 'post',
      url: 'https://oauth2.googleapis.com/token',
      params: {
        // TODO: hide these...
        client_id: '124429870611-6ein0l1nrj8tleuj08splr6jglkmvv4v.apps.googleusercontent.com',
        client_secret: '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',
        refresh_token,
        grant_type: 'refresh_token'
      }
    });

    return responseData.access_token;
  }
  // if it's valid then return it
  else return googleToken;
}

/**
 * return whether google api access token has expired
 */
export async function hasGApiTokenExpired(access_token) {
  const tokenInfo = await getGApiTokenInfo(access_token);
  // if there is no response, it means token has expired
  return !tokenInfo;
}

/**
 * return google api token's info
 */
export async function getGApiTokenInfo(access_token) {
  const response = await axios({
    method: 'get',
    url: 'https://www.googleapis.com/oauth2/v3/tokeninfo',
    params: { access_token }
  }).catch(() => {}); // don't let throw error

  // return response's data if exists
  if (response) return response.data;
}
