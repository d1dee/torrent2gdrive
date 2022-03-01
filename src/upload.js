const fs = require('fs');
const {google} = require('googleapis');
const userDb = require('./schemas/userSchema')
const db = require("./schemas/moviesSchema");
const file = require("file");
const path = require("path");

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const {REDIRECTURIS, CLIENTID, CLIENTSECRET} = process.env;
const oAuth2Client = new google.auth.OAuth2(CLIENTID, CLIENTSECRET, REDIRECTURIS);

/**
 *
 * @param message {Object} Message object of the received message
 * @param bot {Object} Initialized Tg-bot object
 * @param reply_message_id {Number=}
 * @returns {Promise<void>}
 */
exports.driveInt = async (message, bot, reply_message_id) => {
    try {
        let authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline', scope: SCOPES,
        });
        let {text, from: {first_name, username, id: chat_id, language_code, is_bot}} = message
        if (!reply_message_id) {
            try {
                console.log('Waiting for auth')
                const {message_id} = await bot.sendMessage(chat_id, `Click on the below link to authorize this app to write to your Google Drive ${authUrl}`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        force_reply: true
                    }
                }).catch(err => console.log(err))
                console.log(chat_id, first_name)
               await userDb.create({
                    chat_id: chat_id,
                    is_bot: is_bot,
                    start_date: Date.now(),
                    first_name: first_name,
                    username: username,
                    lang: language_code,
                    reply_message_id: message_id
                }, async (err) => {
                   if (err){
                       console.log(err.message);
                       err.code === 11000 ? await userDb.updateOne({chat_id: chat_id},{reply_message_id:message_id}) : console.log('err')
                   }
               })
            }
            catch (err) {
                console.log(err)
            }
        } else if (reply_message_id) {
            try {
                oAuth2Client.getToken(text, async (err, token) => {
                    if (err) {
                        bot.sendMessage(chat_id, `Token error, kindly reAuthenticate <code> ${err} </code>`,
                            {
                                parse_mode: 'HTML'
                            })
                            .catch(err => console.log(err))
                    } else {
                        oAuth2Client.setCredentials(token);
                        await userDb.updateOne({chat_id: chat_id}, {
                            token: JSON.stringify(token)
                        })
                        bot.sendMessage(chat_id, 'User token saved').catch(err => console.log(err))
                    }
                })
            } catch (err) {
                console.log(err)
            }
        }
    } catch (err) {
        console.log(err)
    }
}

exports.setAuth = async (chat_id) => {
    try {
        let {token} = await userDb.findOne({chat_id: chat_id, token: {$ne: null}})
        oAuth2Client.setCredentials(JSON.parse(token));
    } catch (err) {
        console.log(err)
    }
}

exports.listTeamDrive = async (msg, bot, drive_id) => {
    try {
        const {from: {id: chat_id, first_name, username}} = msg
        const user_db = await userDb.findOne({chat_id: chat_id, token: {$ne: null}})
        if (!user_db) {
            bot.sendMessage(chat_id, 'Authorize google drive before using this function.',
                {
                    force_reply: true,
                    input_field_placeholder: '/start'
                })
            return
        }
        if (user_db.drive_id && !drive_id) bot.sendMessage(chat_id, 'Existing Drive Id will be overwritten.')
        const drive = google.drive({version: 'v3', auth: oAuth2Client})
        if (drive_id) {
            const {drive_id: id} = JSON.parse(drive_id)
            drive.files.create({
                supportsAllDrives: true, //allows uploading to TeamDrive
                requestBody: {
                    name: "Torrent Download", //name the file will go by at Google Drive (extension determines the file type if mimetype is ignored)
                    parents: [id], //parent folder where to upload or work on
                    mimeType: 'application/vnd.google-apps.folder',
                }
            }).then(async (response) => {
                let {data: {id, name}} = response
                await userDb.updateOne({chat_id: chat_id}, {drive_id: id}, (err) => {
                    if (err) return console.log(err)
                    bot.sendMessage(chat_id,
                        `Preferred team drive saved successfully. Your downloads will be saved at <code>${name}</code>`,
                        {parse_mode: 'HTML'})
                    console.log(`Drive Id for user ${first_name || username} saved successfully.`)
                })
            })
                .catch(err => console.log(err))
        } else {
            await drive.teamdrives.list({fields: '*', pageSize: 100})
                .then(async (response) => {
                    const {data: {teamDrives: team_drives}} = response
                    if (!team_drives.length) {
                        await bot.sendMessage(chat_id, 'There\'s no team drive associated with your account.' +
                            '\n All uploads will be on you main drive.\nNote: <code>Personal accounts are limited to 15GB</code>',
                            {parse_mode: 'HTML'})
                        drive.files.create({
                            supportsAllDrives: true, //allows uploading to TeamDrive
                            requestBody: {
                                name: "Torrent Download", //name the file will go by at Google Drive (extension determines the file type if mimetype is ignored)
                                mimeType: 'application/vnd.google-apps.folder',
                            }
                        }).then(async (response) => {
                            let {data: {id, name}} = response
                            userDb.updateOne({chat_id: chat_id}, {drive_id: id}, (err) => {
                                if (err) return console.log(err)
                                bot.sendMessage(chat_id,
                                    `Preferred team drive saved successfully. Your downloads will be saved at <code>${name}</code>`,
                                    {parse_mode: 'HTML'})
                                console.log(`Drive Id for user ${first_name || username} saved successfully.`)
                            })
                        })
                            .catch(err => console.log(err))
                    } else {
                        let keyboard = []
                        team_drives.forEach(async (element) => {
                            const {id, name, capabilities: {canAddChildren}} = element
                            if (!canAddChildren) return
                            keyboard.push([{
                                text: `${name}`, callback_data: JSON.stringify({drive_id: id})

                            }])
                        })
                        bot.sendMessage(chat_id, 'Please select a drive below:', {
                            reply_markup: {
                                inline_keyboard: keyboard
                            }
                        })
                    }
                })
        }
    } catch (err) {
        console.log(err)
    }
}
/**
 * @param torrent {object} Has torrent path and torrent name which are needed in order to map the same folder structure in Google Drive
 * @param chat_id {object || string } Has either chat_id about the torrent ie chat_id, season when used by cron job || the userID when used by telegram message
 * @param bot {object} telegram bot initialized at index
 * @param {string} _id mongo _id of the current downloading instance. Only supplied by cron Job
 */
exports.upload = async (torrent, bot, chat_id, _id) => {

    try {
        let user = await userDb.findOne({chat_id: chat_id, token: {$ne: null}}), fileArray = [],
            torrent_path = path.join(__dirname, 'downloads', torrent.name)
        const {token, drive_id} = user;
        oAuth2Client.setCredentials(JSON.parse(token));
        const drive = google.drive({version: 'v3', auth: oAuth2Client})
        if (fs.statSync(torrent_path).isDirectory()) {
            /**
             * Maps the entire torrent folder to an array fileArray
             */
            file.walkSync(path.normalize(torrent_path), async (fsPath, dirs, files) => {
                fileArray.push({
                    fsPath: fsPath, dirName: dirs, files: files, id: null, parentId: null
                })
            })
            for (let e = 0; e < fileArray.length; e++) {
                const {files, fsPath} = fileArray[e];
                let fileArrayFind = fileArray.find(i => i.fsPath === (path.parse(fsPath)).dir)
                if (!fileArrayFind) fileArray[e].id = ((await makeDir((path.parse(fsPath).name))).data).id
                else if (fileArrayFind) {
                    fileArray[e].parentId = fileArrayFind.id
                    fileArray[e].id = ((await makeDir((path.parse(fsPath).name), fileArrayFind.id)).data).id
                }
                if (files.length > 0) {
                    //use the new id assigned as the parent
                    for await (let filename of files) {
                        await uploadFile(fileArray[e], filename)
                    }
                }
            }
        } else if (fs.statSync(torrent_path).isFile()) {
            await uploadFile(torrent_path, torrent.name)
        }
        //create folder for the torrent
        async function makeDir(dirName, parent) {
            if (!parent) parent = drive_id
            return await drive.files.create({
                supportsAllDrives: true, //allows to upload to TeamDrive
                requestBody: {
                    name: dirName, //name the file will go by at google drive (extension determines the file type if mmetype if ignored)
                    parents: [`${parent}`], //parent folder where to upload or work on
                    mimeType: 'application/vnd.google-apps.folder',
                }
            }).catch(err => console.log(err))
        }
        /**
         * @param file_path {string | object} Path where torrent files were stored after download
         * @param filename {string} Name of the torrent as of magnet link supplied
         */
        async function uploadFile(file_path, filename) {
            const {id, fsPath} = file_path;
            let fsMedia, parent = id

            if (!id) parent = drive_id
            if (fsPath) {
                let filePath = path.join(fsPath, filename)
                if (fs.statSync(filePath).isFile()) {
                    fsMedia = {
                        body: await fs.createReadStream(filePath)
                    }
                }
            } else if (fs.statSync(file_path).isFile()) {
                fsMedia = {
                    body: await fs.createReadStream(file_path)
                }
            }

            if (!fsMedia) return
            const {message_id, name} = torrent;
            drive.files.create({
                supportsAllDrives: true, //allows to upload to TeamDrive
                requestBody: {
                    name: filename, //name the file will go by at google drive (extension determines the file type if mmetype if ignored)
                    parents: [`${parent}`], //parent folder where to upload or work on
                }, media: fsMedia
            }, {
                retryConfig: {
                    retry: 10, retryDelay: 2000, onRetryAttempt: (err) => {
                        bot.editMessageText(`Upload failed for ${name} retrying...`, {
                            chat_id: chat_id, message_id: message_id
                        }).catch(err => console.log(err.message))
                        console.log(err)
                    }
                }, retry: true
            }, async (err) => {
                if (err) return console.log(err)

                await fs.rm(file_path, {recursive: true, force: true}, async () => {
                    await bot.editMessageText(`Upload done for ${name}`, {
                        chat_id: chat_id, message_id: message_id
                    }).catch(err => console.log(err.message))
                })
                if (_id) {
                    await db.findOne({_id: _id})
                        .then((doc) => {
                            const {episode} = doc;
                            db.updateOne({_id: _id}, {
                                download: {
                                    episode: episode.last_episode,
                                    file_name: name,
                                    parent_folder_id: parent,
                                    downloaded: true,
                                    download_date: Date.now(),
                                }
                            }).catch((err) => {
                                console.log(err)
                            })
                        })
                }
            })
        }
    } catch (err) {
        console.log(err)
        if (err === 'invalid_grant') {
            await userDb.updateOne({chat_id: chat_id}, {token: {}})
            await bot.sendMessage(chat_id, 'Try authenticating G-drive', {
                force_reply: true,
                input_field_placeholder: '/start'
            })
                .catch(err => console.log(err))
        }
    }
}