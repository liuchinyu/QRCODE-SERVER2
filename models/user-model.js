const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  type: { type: String, required: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  all_ticket: { type: Number, required: true },
  ticket_rest: { type: Number, required: true },
  all_seat: { type: Number, required: true },
  seat_rest: { type: Number, required: true },
  seat: { type: String, required: true },
});

module.exports = mongoose.model("User", userSchema);
