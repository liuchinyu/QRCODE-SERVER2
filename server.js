// 引入必要的模块
const express = require("express");
const dotenv = require("dotenv");
const session = require("express-session");
dotenv.config();

const QRCode = require("qrcode");
const mongoose = require("mongoose");
const app = express();
const authRoute = require("./routes").auth;
const cors = require("cors");

//middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
  .connect(process.env.MONGODB_CONNECTION)
  // .connect("mongodb://localhost:27017/qrcodeDB")
  .then(() => {
    //connect會回傳promise物件
    console.log("成功連結mongoDB...");
  })
  .catch((e) => {
    console.log(e);
  });

// 啟動服務器
app.listen(8080, () => {
  console.log("伺服器正在運行在8080");
});
