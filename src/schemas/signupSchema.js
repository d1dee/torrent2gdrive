const db = require('mongoose')

const signupSchema = new db.Schema({
    userID: String,
    messageId: String,
    date:Date,
    replyTo: {
        userId: String,
        messageId: String,
        date: Date
    },

})

module.exports = db.model('signup', signupSchema)