const fs = require('fs');
const {google} = require('googleapis');
const userDb = require('./schemas/userSchema')
const db = require("./schemas/moviesSchema");
const file = require("file");
const path = require("path");
const progress_bar = require("./progress");
const log = require('loglevel');


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const {REDIRECTURIS, CLIENTID, CLIENTSECRET} = process.env;
const oAuth2Client = new google.auth.OAuth2(CLIENTID, CLIENTSECRET, REDIRECTURIS);

/**
 *
 * @param message {Object} Message object of the received message
 * @param bot {Object} Initialized Tg-bot object
 * @returns {Promise<void>}
 */
exports.driveInt = async (message, bot) => {
    try {
        let authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline', scope: SCOPES,
        });
        let {from: {first_name, username, id: chat_id, language_code, is_bot}} = message

        log.info('Waiting for auth')
        let message_id
        userDb.findOne({chat_id: chat_id}).catch(err => log.error(err))
            .then(async docs => {
                exports.setAuth(chat_id)
                docs
                    ? await bot.sendMessage(chat_id, `User ${(first_name || username)} already exists${
                            docs?.token
                                ? `. If you'd like to generate a new access token, click below:
${authUrl}`
                                : ` but Google drive is not yet authorized. To do so please click below:
${authUrl}`
                        }`,
                        {
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: "Paste you google auth code here"
                            }
                        }
                    ).then(message => message_id = message.message_id)
                        .catch(err => log.error(err.message))
                    : await bot.sendMessage(chat_id, `Click on the below link to authorize this app to write to your Google Drive ${authUrl}`, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: "Paste you google auth code here"
                        }
                    }).then(async message => {
                        await userDb.create({
                            chat_id: chat_id,
                            is_bot: is_bot,
                            start_date: Date.now(),
                            first_name: first_name,
                            username: username,
                            lang: language_code,
                        }, err => {
                            (err) ? log.error(err.message) : null

                        })
                        message_id = message.message_id
                        log.info({message: `New user: ${first_name || username} registered, awaiting auth message`})

                    })
                        .catch(err => log.error(err))

                console.log('reply message', message_id)

                bot.onReplyToMessage(chat_id, message_id, ({text}) => {
                    oAuth2Client.getToken(text, async (err, token) => {
                        if (err) {
                            bot.sendMessage(chat_id, `Token error, kindly reAuthenticate <code> ${err} </code>`,
                                {
                                    parse_mode: 'HTML'
                                })
                                .catch(err => log.error(err))
                        } else {
                            oAuth2Client.setCredentials(token);
                            await userDb.updateOne({chat_id: chat_id}, {
                                token: JSON.stringify(token)
                            })
                            bot.sendMessage(chat_id, 'User token saved')
                                .then(() => log.info({message: `User: ${first_name || username} authorized Google Drive`}))
                                .catch(err => log.error(err))
                        }
                    })
                })
            })
            .catch(err => log.error(err))
    } catch (err) {
        log.error(err)
    }
}

exports.setAuth = async (chat_id) => {
    try {
        console.log(chat_id)
        let {token} = await userDb.findOne({chat_id: chat_id, token: {$ne: null}})
        console.log('token?', token)
        oAuth2Client.setCredentials(JSON.parse(token));
    } catch (err) {
        log.error(err.message)
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
                    if (err) return log.error(err)
                    bot.sendMessage(chat_id,
                        `Preferred team drive saved successfully. Your downloads will be saved at <code>${name}</code>`,
                        {parse_mode: 'HTML'})
                    log.info(`Drive Id for user ${first_name || username} saved successfully.`)
                })
            })
                .catch(err => log.error(err))
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
                                if (err) return log.error(err)
                                bot.sendMessage(chat_id,
                                    `Preferred team drive saved successfully. Your downloads will be saved at <code>${name}</code>`,
                                    {parse_mode: 'HTML'})
                                log.info(`Drive Id for user ${first_name || username} saved successfully.`)
                            })
                        })
                            .catch(err => log.error(err))
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
        log.error(err)
    }
}
/**
 * @param torrent {object} Has torrent path and torrent name which are needed to map the same folder structure in Google Drive
 * @param chat_id {object || string } Has either chat_id about the torrent ie chat_id, season when used by cron job || the userID when used by telegram message
 * @param bot {object} telegram bot initialized at index
 * @param {string} _id mongo _id of the current downloading instance. Only supplied by cron Job
 */
exports.upload = async (torrent, bot, chat_id, _id) => {
    /**
     * torrent {
     *     name:
     *     path:
     *     message_id:
     * }
     */
    try {
        let user = await userDb.findOne({chat_id: chat_id, token: {$ne: null}}), fileArray = [], upload_promise = []

        const {token, drive_id} = user, {path: torrent_path, message_id, name} = torrent;

        oAuth2Client.setCredentials(JSON.parse(token));
        const drive = google.drive({version: 'v3', auth: oAuth2Client})
        if (fs.statSync(torrent_path).isDirectory()) {
            /**
             * Maps the entire torrent folder to an array fileArray
             */
            file.walkSync(path.normalize(torrent_path), async (fsPath, dirs, files) => {
                fileArray.push({
                    fsPath: fsPath, //complete file path
                    dirName: dirs, // directories in the above path
                    files: files, //files in the path
                    id: null, // drive id
                    parentId: null //drive id of the parent folder
                })
            })
            for (let i = 0; i < fileArray.length; i++) {
                if (!i) {
                    fileArray[i].id = (await makeDir(name)).id
                    for await (const file of fileArray[i].files) {
                        upload_promise.push(uploadFile(path.join(fileArray[i].fsPath, file), file, fileArray[i].id))
                    }
                } else {
                    let parent = (fileArray.find(element => element.fsPath === (path.parse(fileArray[i].fsPath)).dir))
                    fileArray[i].id = (await makeDir((path.parse(fileArray[i].fsPath)).base, parent.id)).id
                    fileArray[i].parentId = parent.id
                    for await (const file of fileArray[i].files) {
                        upload_promise.push(uploadFile(path.join(fileArray[i].fsPath, file), file, fileArray[i].id))
                    }
                }
            }
        } else if (fs.statSync(torrent_path).isFile()) {
            upload_promise.push(uploadFile(torrent_path, name))
        }

        //create folder for the torrent
        async function makeDir(dirName, parent) {
            let parent_id = parent ? parent : drive_id
            return (await drive.files.create({
                supportsAllDrives: true, //allows uploading to TeamDrive
                requestBody: {
                    name: dirName, //name the file will go by at Google Drive (extension determines the file type if mimetype is ignored)
                    parents: [`${parent_id}`], //parent folder where to upload or work on
                    mimeType: 'application/vnd.google-apps.folder',
                }
            }).catch(async (err) => {
                log.error(err)
                if (err.message === 'invalid_grant') {
                    await userDb.updateOne({chat_id: chat_id}, {token: {}})
                    await bot.sendMessage(chat_id, 'Try authenticating G-drive then re-download', {
                        force_reply: true,
                        input_field_placeholder: '/start'
                    })
                        .catch(err => log.error(err))
                }
            })).data
        }

        /**
         * @param filePath
         * @param filename {string} Name of the torrent as of magnet link supplied
         * @param id {String=} Parent id string
         */

        async function uploadFile(filePath, filename, id) {
            return new Promise(async (resolve, reject) => {
                let fsMedia, last_time = Date.now(),
                    parent = (!id) ? drive_id : id;
                fs.statSync(filePath).isFile()
                    ? fsMedia = {
                        body: await fs.createReadStream(filePath)
                    }
                    : reject({message: 'File not found',})

                if (!fsMedia) return

                const progress = new progress_bar, file_size = fs.statSync(filePath).size
                progress.init(file_size,`Uploading ${filename}: \n`,'\u2588','\u2591')
                let previous_draw = progress.lastDraw
                drive.files.create({
                    supportsAllDrives: true, //allows uploading to TeamDrive
                    requestBody: {
                        name: filename, //name the file will go by at Google Drive (extension determines the file type if mimetype is ignored)
                        parents: [`${parent}`], //parent folder where to upload or work on
                    }, media: fsMedia
                }, {
                    onUploadProgress: async ({bytesRead}) => {
                        progress.update(bytesRead);
                        (Date.now() > (last_time + 1000))
                            ? previous_draw !== progress?.lastDraw
                                ? (async () => {
                                    last_time = Date.now()
                                    await bot.editMessageText(`${progress.lastDraw}\nChunks: ${bytesRead/file_size}`, {
                                        chat_id: chat_id,
                                        message_id: message_id
                                    }).catch((err) => log.error(err.message))
                                })()
                                : null
                            : null
                    },
                    retryConfig: {
                        retry: 10,
                        retryDelay: 2000,
                        onRetryAttempt: async (err) => {
                            await bot.sendMessage(chat_id, `Upload failed for ${filename} 
                             err: ${err.message} retrying... `).catch(err => log.error(err.message))
                            log.error(err)
                        }
                    }, retry: true
                }, async (err) => {
                    (err)
                        ? reject(err)
                        : resolve('Success')
                })
            })
        }

        Promise.all(upload_promise)
            .then(async () => {
                await fs.rm(torrent_path, {recursive: true, force: true}, async () => {
                    await bot.editMessageText(`Upload done for ${name}`, {
                        chat_id: chat_id, message_id: message_id
                    }).catch(err => log.error(err.message))
                })
                _id
                    ? await db.findOne({_id: _id})
                        .then(async (doc) => {
                            await db.updateOne({_id: doc._id}, {
                                download: {
                                    episode: doc.episode.last_episode,
                                    file_name: name,
                                    downloaded: true,
                                    download_date: Date.now(),
                                }
                            }).catch((err) => {
                                log.error(err)
                            })
                        }) : null
            }).catch(err => log.error(err))
    } catch (err) {
        log.error(err)
        if (err.message === 'invalid_grant') {
            await userDb.updateOne({chat_id: chat_id}, {token: {}})
            await bot.sendMessage(chat_id, 'Try authenticating G-drive', {
                force_reply: true,
                input_field_placeholder: '/start'
            })
                .catch(err => log.error(err))
        }
    }
}