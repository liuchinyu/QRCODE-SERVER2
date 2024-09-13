// 引入必要的模块
const express = require("express");
const dotenv = require("dotenv");
dotenv.config();

const QRCode = require("qrcode");
const app = express();
const authRoute = require("./routes").auth;
const cors = require("cors");

//middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use("/api/user", authRoute);
app.set("view engine", "ejs");

// 建立 QRCode 生成的路由
app.get("/generate", (req, res) => {
  const opts = {
    errorCorrectionLevel: "H",
    type: "image/jpeg",
    quality: 0.3,
    margin: 2,
    scale: 5,
    color: {
      dark: "#272727",
      light: "#F1EFEF",
    },
  };

  const shortenURL =
    "活動名稱:一起到大巨蛋追逐夢想\n公司名稱:增你強股份有限公司"; // 要转换的 URL
  // 生成 QRCode 並渲染到模板
  QRCode.toDataURL(shortenURL, opts, (err, qrCode) => {
    if (err) {
      return res.status(500).send("生成QRCode時發生錯誤");
    }
    res.render("form", { qrCode });
  });
});

// 啟動服務器
app.listen(8080, () => {
  console.log("伺服器正在運行在8080");
});
