const db = require('./schemas/moviesSchema')
const {movieIndex} = require("./puppet");

exports.schedule = async (msg, bot) => {
    try{
        if ((await db.find({imdbID:msg.data.toString().slice(2)})).length > 0) {
            await bot.sendMessage(msg.from.id,'Already scheduled').catch((err) => console.log(err.message))
        } else {
            let omdbResult = (await movieIndex(msg.data.toString().slice(2))).data
            await db.create({
                userID: msg.from.id,
                imdbID: omdbResult.imdbID,
                title: omdbResult.Title,
                type: omdbResult.Type,
                release_date: omdbResult.Released,
                genre: omdbResult.Genre,
            })
            await bot.sendMessage(msg.from.id,omdbResult.Type + ' Added to schedule.')
                .catch((err) => console.log(err.message))
        }
    }
    catch(err){
        console.log(err.message)
    }

}
