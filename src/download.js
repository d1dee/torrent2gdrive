const torrentStream = require('torrent-stream');
const path = require("path");
const {upload} = require("./upload");
const axios = require("axios");

/**
 * @param {string} magnet Magnet link to download
 * @param {object} bot Telegram bot to use when sending messages
 * @param {object || string} chatId Has holds chatId as a string or download chatId when called by cronDownload
 * @param {string} _id mongo _id of the current downloading instance. Only supplied by cron Job
 */
exports.download = async (magnet, bot, chatId, _id) => {
    await axios.get(magnet, {
        transformResponse: [(data => {
            return data.match(/"magnet:\?.*?"/m)[0]
        })]
    }).then((response) => {
        magnet = response.data
    }).catch((err) => {
        console.log(err.message)
    })
    let msgEdit
    try {
        let engine = torrentStream(magnet, {
            connections: 10000,     // Max amount of peers to be connected to.
            uploads: 100,          // Number of upload slots.
            tmp: path.join(__dirname, 'tmp'),
            path: path.join(__dirname, 'downloads'),
            trackers: ['udp://tracker.openbittorrent.com:80', 'udp://tracker.ccc.de:80'],
        });

        engine.on('ready', async () => {
            let length = engine.torrent.length, pieceLength = engine.torrent.pieceLength,
                lastPieceLength = engine.torrent.lastPieceLength,
                totalPieces = ((length - lastPieceLength) / pieceLength) + 1, pieceCount = 0, lastPer
            if (chatId) msgEdit = await bot.sendMessage(chatId, `Download started for ${engine.torrent.name}`).catch(err => console.log(err.message))
            engine.files.forEach((file) => {
                console.log('filename:', file.name)
                file.select()
            });
            let datePriv = Date.now()
            engine.on('download', async () => {
                let currentPercentage = ((pieceCount / totalPieces) * 100).toFixed(2)
                if (Date.now() >= (datePriv + 1000)) {
                    datePriv = Date.now()
                    if (currentPercentage !== lastPer && msgEdit) {
                        await bot.editMessageText(` Downloading: \n ${engine.torrent.name} \n \tDownloaded ${currentPercentage}% \tSpeed: ${(engine.swarm.downloadSpeed() * 0.000001).toFixed(2)} MB/s`, {
                            chat_id: chatId,
                            message_id: msgEdit.message_id
                        }).catch((err) => console.log(err.code))
                        lastPer = currentPercentage
                    }
                }
                pieceCount++
            })
            engine.on('idle', async () => {
                if (msgEdit) {
                    await bot.editMessageText(`Download done for ${engine.torrent.name}`, {
                        chat_id: chatId,
                        message_id: msgEdit.message_id
                    }).catch(err => console.log(err.message))
                } else if (chatId) await bot.sendMessage(chatId, `Download done for ${engine.torrent.name}`)
                    .catch(err => console.log(err.message))
                engine.destroy(async () => {
                    let torrent = {
                        name: engine.torrent.name, path: engine.torrent.path, msgEdit: msgEdit
                    }
                    await upload(torrent, chatId, bot, _id)
                })
            })
        })
    } catch (err) {
        console.log(err.message)
    }

}
