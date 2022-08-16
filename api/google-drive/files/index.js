import axios from 'axios';
import User from '../../../models/User';
import { getGApiAccessToken } from '../../../utils/tokenUtils';

/**
 *  get all non-trashed files (< 300mb / each) that can be `export` to PDF of this user in Google Drive
 */
export async function get(req) {
  // check if userID passed in matches with either MongoDB ObjectID or auth0's user ID
  const user = await User.getUserFromIDAndVerifyExistence(req.token.auth0ID);

  const googleToken = await getGApiAccessToken(user._id, req.user.sub);

  // use google token to get user's google drive files
  const { data } = await axios({
    method: 'get',
    url: 'https://www.googleapis.com/drive/v3/files',
    params: {
      pageToken: req.query.pageToken, // token for next page
      fields: 'files(id, name, size, modifiedTime, mimeType)', // select fields
      orderBy: 'modifiedTime desc',
      // non-trashed files that user owns
      // only allow file types that can be `export` to pdf with Google Drive api
      q: `'me' in owners and trashed = false and 
      (
      mimeType contains 'application/pdf' 
      or mimeType contains 'image/' 
      or mimeType contains 'application/vnd.google-apps.spreadsheet' 
      or mimeType contains 'application/vnd.google-apps.document' 
      or mimeType contains 'application/vnd.google-apps.presentation'
      )`
    },
    headers: {
      Authorization: 'Bearer ' + googleToken
    }
  });

  // make sure to only return files that are less than 10mb
  data.files = data.files.filter(file => {
    // Google docs/spreadsheet/presentation don't have file size. Accept them automatically
    if (!file.size) return true;
    // otherwise, must be less than 300mb
    else return parseInt(file.size) < 300000000;
  });

  // return google drive api response
  return data;
}
