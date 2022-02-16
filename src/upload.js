const fs = require('fs');
const {google} = require('googleapis');
const userDb = require('./schemas/userSchema')
const db = require("./schemas/moviesSchema");
const file = require("file");
const path = require("path");

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const oAuth2Client = new google.auth.OAuth2(process.env.clientId, process.env.clientSecret, process.env.redirectUris);

/**
 *
 * @param msg {Object} Message object of the received message
 * @param bot {Object} Initialized Tg-bot object
 * @param replyMsgId
 * @returns {Promise<void>}
 */
exports.driveInt = async (msg, bot, replyMsgId) => {
    try {
        let authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline', scope: SCOPES,
        });
        const {first_name, username, id, language_code, is_bot} = msg.from;
        if (!replyMsgId) {
            try {
                console.log('Waiting for auth')
                let auth = await bot.sendMessage(id, `Click on the below link to authorize this app to write to your Google Drive ${authUrl}`, {
                    parse_mode: 'HTML', "reply_markup": {
                        force_reply: true
                    }
                }).catch(err => console.log(err.message))
                await userDb.create({
                    id: id,
                    is_bot: is_bot,
                    start_date: (Date.now()).toString(),
                    first_name: first_name,
                    username: username,
                    lang: language_code,
                    tokenMsg: auth.message_id
                }, async (err) => {
                    if (err && err.code === 11000) {
                        await userDb.updateOne({id: id}, {tokenMsg: (auth.message_id).toString()})
                    }
                })
            } catch (err) {
                console.log(err)
            }
        } else if ((replyMsgId)) {
            try {
                oAuth2Client.getToken(msg.text, async (err, token) => {
                    if (err) {
                        await bot.sendMessage(id, `Token error, kindly reAuthenticate <code> ${err.message} </code>`, {parse_mode: 'HTML'}).catch(err => console.log(err.message))
                    } else {
                        oAuth2Client.setCredentials(token);
                        await userDb.updateOne({id: id}, {
                            token: JSON.stringify(token)
                        })
                        bot.sendMessage(id, 'User token saved').catch(err => console.log(err.message))
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

exports.setAuth = async (msg) => {
    try {
        const {id} = msg.from;
        let user = await userDb.findOne({id: id, token: {$ne: null}})
        oAuth2Client.setCredentials(JSON.parse(user.token));
    } catch (err) {
        console.log(err.message)
    }
}

exports.listTeamDrive = async (msg, bot, driveId) => {
    try {
        const {message_id, text, from} = msg
        if (!await userDb.findOne({id: from.id, token: {$ne: null}})) {
            bot.sendMessage(from.id, 'Authorize google drive before using this function.',
                {
                    force_reply: true,
                    input_field_placeholder: '/start'
                })
            return
        }
        const drive = google.drive({version: 'v3', auth: oAuth2Client})
        if (driveId) {
            await drive.files.create({
                supportsAllDrives: true, //allows uploading to TeamDrive
                requestBody: {
                    name: "Torrent Download", //name the file will go by at Google Drive (extension determines the file type if mimetype is ignored)
                    parents: [driveId], //parent folder where to upload or work on
                    mimeType: 'application/vnd.google-apps.folder',
                }
            }).then(async (response) => {
                let {data: {id, name}} = response
                await userDb.updateOne({id: from.id}, {driveId: id}, (err) => {
                    if (err) return
                    bot.sendMessage(from.id,
                        `Preferred team drive saved successfully. Your downloads will be saved at <code>${name}</code>`,
                        {parse_mode: 'HTML'})
                    console.log(`Drive Id for user ${from.first_name || from.username} saved successfully.`)

                })
            })
                .catch(err => console.log(err.message))
        } else {
            await drive.teamdrives.list({fields: '*'})
                .then(async (res) => {
                    const {data: {nextPageToken, teamDrives}} = res
                    if (!teamDrives.length) {
                        await bot.sendMessage(from.id, 'There is no team drive associated with your account.' +
                            '\nAll uploads will be on you main drive.\nNote: <code>Personal accounts are limited to 15GB</code>',
                            {parse_mode: 'HTML'})
                        await drive.files.create({
                            supportsAllDrives: true, //allows uploading to TeamDrive
                            requestBody: {
                                name: "Torrent Download", //name the file will go by at Google Drive (extension determines the file type if mimetype is ignored)
                                //parents: [driveId], //parent folder where to upload or work on
                                mimeType: 'application/vnd.google-apps.folder',
                            }
                        }).then(async (response) => {
                            let {data: {id, name}} = response
                            await userDb.updateOne({id: from.id}, {driveId: id}, (err) => {
                                if (err) return
                                bot.sendMessage(from.id,
                                    `Preferred team drive saved successfully. Your downloads will be saved at <code>${name}</code>`,
                                    {parse_mode: 'HTML'})
                                console.log(`Drive Id for user ${from.first_name || from.username} saved successfully.`)

                            })

                        })
                            .catch(err => console.log(err.message))
                    } else {
                        let keyboard = []
                        teamDrives.forEach(async (e) => {
                            const {id, name, capabilities: {canAddChildren}} = e
                            if (!canAddChildren) return
                            keyboard.push([{
                                text: `${name}`, callback_data: `DriveId ${id}`
                            }])
                        })
                        await bot.sendMessage(from.id, 'Please select a drive below:', {
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
 * @param chatId {object || string } Has either chatId about the torrent ie chatId, season when used by cron job || the userID when used by telegram message
 * @param bot {object} telegram bot initialized at index
 * @param {string} _id mongo _id of the current downloading instance. Only supplied by cron Job
 */
exports.upload = async (torrent, chatId, bot, _id) => {

    try {
        let user = await userDb.findOne({id: chatId, token: {$ne: null}}), fileArray = [],
            torPath = path.join(__dirname, 'downloads', torrent.name)
        const {token, driveId} = user;
        oAuth2Client.setCredentials(JSON.parse(token));
        const drive = google.drive({version: 'v3', auth: oAuth2Client})
        if (fs.statSync(torPath).isDirectory()) {
            /**
             * Maps the entire torrent folder to an array fileArray
             */
            file.walkSync(path.normalize(torPath), async (fsPath, dirs, files) => {
                fileArray.push({
                    fsPath: fsPath, dirName: dirs, files: files, id: null, parentId: null
                })
            })
            for (let e = 0; e < fileArray.length; e++) {
                const {files, fsPath} = fileArray[e];
                let fileArrayFind = fileArray.find(i => i.fsPath === (path.parse(fsPath)).dir)
                console.log(path.parse(fileArray),'upload called')
                if (!fileArrayFind) fileArray[e].id = ((await makeDir((path.parse(fsPath).name))).data).id
                else if (fileArrayFind) {
                    fileArray[e].parentId = fileArrayFind.id
                       
                    fileArray[e].id = ((await makeDir((path.parse(fsPath).name), fileArrayFind.id)).data).id
                }
                if (files.length > 0) {
                    //use the new id assigned as the parent
                    for await (let filename of files) {
                        console.log(filename)
                        await uploadFile(fileArray[e], filename)
                    }
                }
            }
        } else if (fs.statSync(torPath).isFile()) {
            await uploadFile(torPath, torrent.name)
        }
        
        //create folder for the torrent
        async function makeDir(dirName, parent) {
            if (!parent) parent = driveId
            return await drive.files.create({
                supportsAllDrives: true, //allows to upload to TeamDrive
                requestBody: {
                    name: dirName, //name the file will go by at google drive (extension determines the file type if mmetype if ignored)
                    parents: [`${parent}`], //parent folder where to upload or work on
                    mimeType: 'application/vnd.google-apps.folder',
                }
            })
        }

        /**
         * @param filePath {string | object} Path where torrent files were stored after download
         * @param filename {string} Name of the torrent as of magnet link supplied
         */
        async function uploadFile(filePath, filename) {
            const {id, fsPath} = filePath;
            let fsMedia, parent = id

            if (!id) parent = driveId
            if (fsPath) {
                let filePath = path.join(fsPath, filename)
                if (fs.statSync(filePath).isFile()) {
                    fsMedia = {
                        body: await fs.createReadStream(filePath)
                    }
                }
            } else if (fs.statSync(filePath).isFile()) {
                fsMedia = {
                    body: await fs.createReadStream(filePath)
                }
            }

            if (!fsMedia) return

            await drive.files.create({
                supportsAllDrives: true, //allows to upload to TeamDrive
                requestBody: {
                    name: filename, //name the file will go by at google drive (extension determines the file type if mmetype if ignored)
                    parents: [`${parent}`], //parent folder where to upload or work on
                }, media: fsMedia
            }, {
                retryConfig: {
                    retry: 10, retryDelay: 2000, onRetryAttempt: (err) => {
                        const {msgEdit, name} = torrent;
                        bot.editMessageText(`Upload failed for ${name} retrying...`, {
                            chat_id: chatId, message_id: msgEdit.message_id
                        }).catch(err => console.log(err))
                        console.log(err)
                    }
                }, retry: true
            }, async (err) => {
                if (err) return console.log(err)
                const {msgEdit, name} = torrent;
                await fs.rm(torPath, {recursive: true, force: true}, async () => {
                    await bot.editMessageText(`Upload done for ${name}`, {
                        chat_id: chatId, message_id: msgEdit.message_id
                    }).catch(err => console.log(err))
                })
                if (_id) {
                    await db.findOne({_id: _id})
                        .then((doc) => {
                            const {episode} = doc;
                            db.updateOne({_id: _id}, {
                                download: {
                                    episode: episode.lastEpisode,
                                    downloaded: true,
                                    downloadDate: Date.now(),
                                    fileName: name,
                                }
                            }).catch((err) => {
                                console.log(err)
                            })
                        })
                }

            })
        }

    } catch (err) {
        console.log(err.message)
        if (err.message === 'invalid_grant') {
            await userDb.updateOne({id: chatId}, {token: {}})
            await bot.sendMessage(chatId, 'Try authenticating G-drive', {
                force_reply: true,
                input_field_placeholder: '/start'
            })
                .catch(err => console.log(err))
        }

    }
}
