const torrentStream = require('torrent-stream');
const path = require("path");
const {upload} = require("./upload");
const cliProgress = require('cli-progress');
const fs = require("fs");
const log = require('loglevel');
/**
 * @param {string} magnet Magnet link to download
 * @param {object} bot Telegram bot to use when sending messages
 * @param {object || string} chat_id Has holds chat_id as a string or download chat_id when called by cronDownload
 * @param {string=} _id mongo _id of the current downloading instance. Only supplied by cron Job
 */
exports.download = async (magnet, bot, chat_id, _id) => {
    try {
        let trackers = JSON.parse(fs.readFileSync(path.join(__dirname, 'trackers.json'), {encoding: 'utf8'}))

        log.info(magnet)

        let engine = torrentStream(magnet, {
            connections: 10000,     // Max amount of peers to be connected to.
            uploads: 100,          // Number of upload slots.
            tmp: path.join(__dirname, 'tmp'),
            path: path.join(__dirname, 'downloads'),
            trackers: trackers,
        });
        const progress = new cliProgress.SingleBar({
            format: `Downloading {name}
{bar}| {percentage}%
{pieces_count}/{total_pieces} Chunks || Speed: {speed}MB/s || Eta: {eta_formatted}`,
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            stopOnComplete:true,
            clearOnComplete:true,
            etaBuffer:20,
            barsize:30,
            fps: 1 //reduce amount draws per second
        });
        engine.on('ready', async () => {
            let {length, pieceLength, lastPieceLength} = engine.torrent,
                totalPieces = ((length - lastPieceLength) / pieceLength) + 1,
                pieceCount = 0, {message_id} = {}
            progress.start(100, 0, {
                speed: 0
            })
            chat_id ? {message_id} = await bot.sendMessage(chat_id, `Download started for ${engine.torrent.name}`)
                .catch(err => log.error(err.message)) : undefined
            const {files} = engine
            files.forEach((file) => {
                log.info('filename:', file.name)
                file.select()
            })
            engine.on('download', async () => {
                    progress.update(Math.round((pieceCount * 100) / totalPieces), {
                        pieces_count: pieceCount,
                        total_pieces: totalPieces,
                        speed: (engine.swarm.downloadSpeed() * 0.000001).toFixed(2),
                        name: engine.torrent.name
                    })
                progress.on('redraw-post', async () => {
                    await bot.editMessageText(progress.lastDrawnString, {
                        chat_id: chat_id,
                        message_id: message_id
                    }).catch((err) => log.error(err.message))
                })
                pieceCount++
            })
            engine.on('idle', () => {
                message_id ?
                    bot.editMessageText(`Download done for ${engine.torrent.name}`, {
                        chat_id: chat_id,
                        message_id: message_id
                    }).catch(err => log.error(err.message))
                    : chat_id ? bot.sendMessage(chat_id, `Download done for ${engine.torrent.name}`)
                        .catch(err => log.error(err.message)) : undefined
                engine.destroy(async () => {
                    let torrent = {
                        name: engine.torrent.name,
                        path: path.join(__dirname, 'downloads', engine.torrent.name),
                        message_id: message_id
                    }
                    upload(torrent, bot, chat_id, _id)
                })
            })
        })
    } catch (err) {
        log.error(err.message)
    }
}