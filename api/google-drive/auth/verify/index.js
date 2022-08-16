import User from '../../../../models/User';
import { getGApiAccessToken, getGApiTokenInfo } from '../../../../utils/tokenUtils';

/**
 *  check whether the current credentials have at least read access to their Google Drive files
 */
export async function get(req, res) {
  // can only proceed if user exists
  const user = await User.getUserFromIDAndVerifyExistence(req.token.auth0ID);

  const token = await getGApiAccessToken(user._id, req.user.sub);
  const tokenInfo = await getGApiTokenInfo(token);

  // if `gDriveApiRefreshToken` exists but token's scope doesn't include drive read-only
  // this means the user has granted drive read-only access, but token scope was overwritten by recent login
  // return 204
  if (tokenInfo.scope.includes('https://www.googleapis.com/auth/drive.readonly') || user.gDriveApiRefreshToken)
    res.status(204);
  else res.status(403);
}
