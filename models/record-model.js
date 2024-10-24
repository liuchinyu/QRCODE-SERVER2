const mongoose = require("mongoose");
const { Schema } = mongoose;

const recordSchema = new Schema({
  get_ticket_date: { type: String, required: true },
  donor: { type: String, required: true },
  taker: { type: String, required: true },
  ticket_id: { type: String, required: true },
  ticket_count: { type: Number, required: true },
  ticket_kid: { type: Number, required: true },
  ticket_left: { type: Number, required: true },
  seat: { type: String, required: true },
  email: { type: String, required: true },
  url: { type: String, required: true },
});

module.exports = mongoose.model("Record", recordSchema);
