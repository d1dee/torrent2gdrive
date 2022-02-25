const torrentStream = require('torrent-stream');
const path = require("path");
const {upload} = require("./upload");

/**
 * @param {string} magnet Magnet link to download
 * @param {object} bot Telegram bot to use when sending messages
 * @param {object || string} chat_id Has holds chat_id as a string or download chat_id when called by cronDownload
 * @param {string=} _id mongo _id of the current downloading instance. Only supplied by cron Job
 */
exports.download = async (magnet, bot, chat_id, _id) => {
    try {
        console.log(magnet)
        let engine = torrentStream(magnet, {
            connections: 10000,     // Max amount of peers to be connected to.
            uploads: 100,          // Number of upload slots.
            tmp: path.join(__dirname, 'tmp'),
            path: path.join(__dirname, 'downloads'),
            trackers: ['udp://tracker.openbittorrent.com:80', 'udp://tracker.ccc.de:80'],
        });

        engine.on('ready', async () => {
            let {length, pieceLength, lastPieceLength} = engine.torrent,
                totalPieces = ((length - lastPieceLength) / pieceLength) + 1,
                pieceCount = 0, last_percentage, {message_id} = {}
                    chat_id ? {message_id} = await bot.sendMessage(chat_id, `Download started for ${engine.torrent.name}`)
                        .catch(err => console.log(err.message)) : undefined
            const {files} = engine
            files.forEach((file) => {
                console.log('filename:', file.name)
                file.select()
            })

            let previous_date = Date.now()

            engine.on('download', async () => {
                let currentPercentage = ((pieceCount / totalPieces) * 100).toFixed(2)
                if (Date.now() >= (previous_date + 1000)) {
                    previous_date = Date.now()
                    if (currentPercentage !== last_percentage && message_id) {
                        await bot.editMessageText(`Downloading: \n ${engine.torrent.name} \n \tDownloaded ${currentPercentage}% \tSpeed: ${(engine.swarm.downloadSpeed() * 0.000001).toFixed(2)} MB/s`, {
                            chat_id: chat_id,
                            message_id: message_id
                        }).catch((err) => console.log(err.code))
                        last_percentage = currentPercentage
                    }
                }
                pieceCount++
            })
            engine.on('idle',() => {
                message_id ?
                    bot.editMessageText(`Download done for ${engine.torrent.name}`, {
                        chat_id: chat_id,
                        message_id: message_id
                    }).catch(err => console.log(err.message))
                    : chat_id ? bot.sendMessage(chat_id, `Download done for ${engine.torrent.name}`)
                        .catch(err => console.log(err.message)) : undefined
                engine.destroy(async () => {
                    let torrent = {
                        name: engine.torrent.name,
                        path: engine.torrent.path,
                        message_id: message_id
                    }
                     upload(torrent, bot, chat_id, _id)
                })
            })
        })
    } catch (err) {
        console.log(err.message)
    }

}
