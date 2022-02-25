const db = require('mongoose')

const userSchema = new db.Schema({
    chat_id: {
        type: String,
        unique: true
    },
    is_bot: Boolean,
    start_date: Date,
    first_name: String,
    username: String,
    lang: String,
    token: String,
    reply_message_id: Number,
    drive_id: String,
})

module.exports = db.model('user', userSchema)
