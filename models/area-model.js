const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema({
  // 參加者名字
  areaName: {
    type: String,
    required: true,
    unique: true,
  },
  // 座位設定
  areaConfigs: [
    {
      // 區域
      areaNumber: {
        type: Number,
        required: true,
      },
      // 排數、該牌第一個位子及最後一位
      rowConfigs: [
        {
          rowNumber: Number,
          startSeat: Number,
          endSeat: Number,
        },
      ],
      // 跳轉規則
      jumpRules: [
        {
          fromArea: Number,
          fromRow: Number,
          fromSeat: Number,
          toArea: Number,
          toRow: Number,
          toSeat: Number,
        },
      ],
    },
  ],
});

module.exports = mongoose.model("Area", areaSchema);
