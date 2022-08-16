import axios from 'axios';
import User from '../../../../models/User';
import Post from '../../../../models/Post';
import Attachment from '../../../../models/Attachment';
import { getGApiAccessToken } from '../../../../utils/tokenUtils';
import verifySchema from '../../../../guards/verifySchema';

// max file size is 300mb
const maxFileSize = 300000000;

/**
 * export google drive files into PDF and create a post for each file, with fields set to `setFields` if given
 * return newly created posts
 */
export async function post(req) {
  // check if userID passed in matches with either MongoDB ObjectID or auth0's user ID
  const user = await User.getUserFromIDAndVerifyExistence(req.token.auth0ID);

  const googleToken = await getGApiAccessToken(user._id, req.user.sub);

  let newPosts = [];

  for (const fileMeta of req.body.files) {
    // FILE REQUEST OPTIONS
    // if is google app natives' then the (exported) `mimeType` is pdf, otherwise have original `mimetype`
    const mimeType = fileMeta.mimeType.includes('application/vnd.google-apps') ? 'application/pdf' : fileMeta.mimeType;
    // use export url for google native apps', otherwise use download url
    const url = fileMeta.mimeType.includes('application/vnd.google-apps')
      ? `https://www.googleapis.com/drive/v3/files/${fileMeta.id}/export`
      : `https://www.googleapis.com/drive/v3/files/${fileMeta.id}`;
    // params depending on `url`
    const params = fileMeta.mimeType.includes('application/vnd.google-apps') ? { mimeType } : { alt: 'media' };

    // export if this is google native apps'
    const { data: file } = await axios({
      method: 'get',
      url,
      params,
      responseType: 'arraybuffer', // IMPORTANT to make sure it doesn't save blank pages
      maxBodyLength: maxFileSize,
      maxContentLength: maxFileSize,
      headers: {
        Authorization: 'Bearer ' + googleToken
      }
    });

    // get `setFields` and verify with Post schema if given
    const setFields = req.body.setFields ? req.body.setFields : {};
    if (req.body.setFields) await verifySchema('Post', setFields);
    // create post and automatically publish it
    const post = await Post.create({ author: user._id, type: 'UPLOAD_NOTE', publishDate: new Date(), ...setFields });

    // if file is google apps' native then append '.pdf' to file name
    const name = fileMeta.name + (fileMeta.mimeType.includes('application/vnd.google-apps') ? '.pdf' : '');

    // create attachment metadata object referencing post
    const attachment = (
      await Attachment.create({
        parentType: 'Post',
        parent: post._id,
        originalName: name
      })
    ).toObject();

    // put file in GCS under attachment objectID
    const signedUrl = await Attachment.getUploadURLForAttachment(attachment._id);
    await axios({
      method: 'put',
      url: signedUrl,
      maxBodyLength: maxFileSize,
      maxContentLength: maxFileSize,
      headers: {
        'Content-Type': fileMeta.mimeType
      },
      data: file
    });

    // append attachment to newly created post
    post.attachment = { ...attachment, url: signedUrl}

    newPosts.push(post);
  }

  return newPosts;
}
