// 引入必要的模块
const express = require("express");
const dotenv = require("dotenv");
const session = require("express-session");
dotenv.config();

const User = require("./models/").user;

const QRCode = require("qrcode");
const mongoose = require("mongoose");
const app = express();
const authRoute = require("./routes").auth;
const cors = require("cors");
const port = process.env.PORT || 8080;

//middlewares
app.use(express.json({ limit: "50mb" })); //增大limit以傳輸更多QRCODE
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  session({
    secret: "秘密字串練習",
    resave: false,
    saveUnitialized: false,
    cookie: { secure: false }, //localhost沒有https
  })
);
app.use(cors());

app.use("/api/user", authRoute);

mongoose
  .connect(process.env.MONGODB_CONNECTION, { dbName: "qrcodeDB" })
  // .connect("mongodb://localhost:27017/qrcodeDB")
  .then(async () => {})
  .catch((e) => {
    console.log(e);
  });
// console.log("1");
// 啟動服務器
app.listen(port, () => {
  console.log("伺服器正在運行在8080");
});
