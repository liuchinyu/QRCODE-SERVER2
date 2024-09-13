require("dotenv").config();
const router = require("express").Router();
const Database = require("../models/database2");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;

let file_name = "";

router.post("/login", async (req, res) => {
  let { password } = req.body;
  try {
    if (Database.connect()) {
      //若資料庫連接成功判斷輸入的識別碼是否有其名單

      let result = await Database.getAccount(password);
      if (result.rows.length > 0) {
        res.send(result.rows[0]);
        return result.rows[0];
      } else {
        // return
        return res.send(result.rows[0]);
      }
    } else {
      res.status(500).send("資料庫連接失敗");
    }
  } catch (e) {
    console.log(e);
  }
});

router.post("/login_person", async (req, res) => {
  let { password } = req.body;
  try {
    if (Database.connect()) {
      //若資料庫連接成功判斷輸入的識別碼是否有其名單

      let result = await Database.getAccount_person(password);
      if (result.rows.length > 0) {
        res.send(result.rows[0]);
        return result.rows[0];
      } else {
        // return
        return res.send(result.rows[0]);
      }
    } else {
      res.status(500).send("資料庫連接失敗");
    }
  } catch (e) {
    console.log(e);
  }
});

router.post("/update_data", async (req, res) => {
  let { password, ticket_left } = req.body;

  try {
    if (Database.connect()) {
      //若資料庫連接成功判斷輸入的識別碼是否有其名單
      let result = await Database.updateData(password, ticket_left);
      if (result) {
        return res.send(result);
      } else {
        res.status(500).send("更新資料庫失敗");
      }
    } else {
      res.status(500).send("資料庫連接失敗");
    }
  } catch (e) {
    console.log(e);
  }
});

cloudinary.config({
  cloud_name: process.env.cloud_name,
  api_key: process.env.api_key,
  api_secret: process.env.api_secret,
});

const saveQRCodeToFile = (base64Image) => {
  const base64Data = base64Image.replace(/^data:image\/png;base64,/, "");
  // const filePath = path.join(
  //   __dirname,
  //   "../public/qrcodes",
  //   `qrcode-${Date.now()}.png`
  // );
  let time = Date.now();
  file_name =
    "\\\\tpfile\\Everyone\\temp\\QRCODE\\" + "qrcode-" + time + ".png";
  const filePath = path.join(
    "//tpfile/Everyone/temp/QRCODE",
    `qrcode-${time}.png`
  );

  fs.writeFileSync(filePath, base64Data, "base64");
  return filePath;
};

const uploadQRCodeToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "qrcodes", // 將圖片放到 Cloudinary 的 qrcodes 資料夾中
    });
    return result.secure_url; // 獲取公開的圖片 URL
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw error;
  }
};

router.post("/user-send-email", async (req, res) => {
  if (req.method === "POST") {
    //日期格式轉換
    let cur_time = new Date();
    let formattedString = cur_time.toLocaleString();
    cur_time = formattedString.slice(0, 10).trim(); //領票日期

    const { qrCodeUrl, names, seat, username, numbers, emails } = req.body;
    let domain = emails.split("@")[1]; //取得domain

    // 保存base64圖片到伺服器
    const filePath = saveQRCodeToFile(qrCodeUrl);

    // 上傳到 Cloudinary 並獲取公開的 URL
    const qrCodeUrlOnCloudinary = await uploadQRCodeToCloudinary(filePath);

    // 設定郵件傳輸服務
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.user,
        pass: process.env.password,
      },
    });

    let mailOptions = "";
    if (domain == "gmail.com") {
      mailOptions = {
        from: '"<qrcode0908@gmail.com>"',
        to: emails,
        subject: "<<接棒未來，揮出夢想>>取票成功通知",
        html: `
          <p>${username} 您好，</p>
          <p style="color:red">取票成功!當天出示下方QRCODE即可入場！期待您一同共襄盛舉！</p>
          <img src="${qrCodeUrlOnCloudinary}" alt="QR Code" />
          <p>活動名稱：接棒未來，揮出夢想</p>
          <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
          <p>活動日期：2024年11月23日(六)</p>
          <p>活動時間：13:00~15:30</p>
          <p>公司名稱：${names}</p>
          <p>領票人姓名：${username}</p>
          <p>座位區域：${seat}</p>
          <p>取票數量：${numbers}</p>
          <p style="color:blue; font-size:14px;">***系統操作或票券取得相關問題，請洽客服專線(02)2792-8788#502</p>
          <p style="color:blue; font-size:14px;">***服務時間：週一到週五 09:00~18:00</p>
        `,
      };
    } else {
      mailOptions = {
        from: '"活動通知-入場電子票券" <qrcode0908@gmail.com>',
        to: emails,
        subject: "<<接棒未來，揮出夢想>>取票成功通知",
        html: `
        <p>${username} 您好，</p>
        <p style="color:red">取票成功!當天出示下方QRCODE即可入場！期待您一同共襄盛舉！</p>
        <img src="${qrCodeUrl}" alt="QR Code" />
        <p>活動名稱：接棒未來，揮出夢想</p>
        <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
        <p>活動日期：2024年11月23日(六)</p>
        <p>活動時間：13:00~15:30</p>
        <p>公司名稱：${names}</p>
        <p>領票人姓名：${username}</p>
        <p>座位區域：${seat}</p>
        <p>取票數量：${numbers}</p>
        <p style="color:blue; font-size:14px;">***系統操作或票券取得相關問題，請洽客服專線(02)2792-8788#502</p>
        <p style="color:blue; font-size:14px;">***服務時間：週一到週五 09:00~18:00</p>
      `,
      };
    }

    // 設定郵件內容

    // 發送郵件
    try {
      let send_result = await transporter.sendMail(mailOptions);
      if (send_result) {
        res.status(200).json({ message: "Email sent successfully" });
        //將領取票券資料存入DB
        if (Database.connect()) {
          Database.insertData(
            cur_time,
            names,
            username,
            numbers,
            emails,
            file_name
          );
        }
      }
    } catch (error) {
      console.error("Error sending email:", error);
      return res.status(500).json({ error: "Failed to send email" });
    }
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
});
router.post("/user-send-email-person", async (req, res) => {
  if (req.method === "POST") {
    //日期格式轉換
    let cur_time = new Date();
    let formattedString = cur_time.toLocaleString();
    cur_time = formattedString.slice(0, 10).trim(); //領票日期

    const { qrCodeUrl, names, seat, username, numbers, emails } = req.body;
    let domain = emails.split("@")[1]; //取得domain

    // 保存base64圖片到伺服器
    const filePath = saveQRCodeToFile(qrCodeUrl);

    // 上傳到 Cloudinary 並獲取公開的 URL
    const qrCodeUrlOnCloudinary = await uploadQRCodeToCloudinary(filePath);

    // 設定郵件傳輸服務
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.user,
        pass: process.env.password,
      },
    });

    let mailOptions = "";
    if (domain == "gmail.com") {
      mailOptions = {
        from: '"<qrcode0908@gmail.com>"',
        to: emails,
        subject: "<<接棒未來，揮出夢想>>取票成功通知",
        html: `
          <p>${username} 您好，</p>
          <p style="color:red">取票成功!當天出示下方QRCODE即可入場！期待您一同共襄盛舉！</p>
          <img src="${qrCodeUrlOnCloudinary}" alt="QR Code" />
          <p>活動名稱：接棒未來，揮出夢想</p>
          <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
          <p>活動日期：2024年11月23日(六)</p>
          <p>活動時間：13:00~15:30</p>
          <p>領票人姓名：${username}</p>
          <p>座位區域：${seat}</p>
          <p>取票數量：${numbers}</p>
          <p style="color:blue; font-size:14px;">***系統操作或票券取得相關問題，請洽客服專線(02)2792-8788#502</p>
          <p style="color:blue; font-size:14px;">***服務時間：週一到週五 09:00~18:00</p>
        `,
      };
    } else {
      mailOptions = {
        from: '"活動通知-入場電子票券" <qrcode0908@gmail.com>',
        to: emails,
        subject: "<<接棒未來，揮出夢想>>取票成功通知",
        html: `
        <p>${username} 您好，</p>
        <p style="color:red">取票成功!當天出示下方QRCODE即可入場！<span style="color:purple">期待您一同共襄盛舉！</span></p>
        <img src="${qrCodeUrl}" alt="QR Code" />
        <p>活動名稱：接棒未來，揮出夢想</p>
        <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
        <p>活動日期：2024年11月23日(六)</p>
        <p>活動時間：13:00~15:30</p>
        <p>領票人姓名：${username}</p>
        <p>座位區域：${seat}</p>
        <p>取票數量：${numbers}</p>
        <p style="color:blue; font-size:14px;">***系統操作或票券取得相關問題，請洽客服專線(02)2792-8788#502</p>
        <p style="color:blue; font-size:14px;">***服務時間：週一到週五 09:00~18:00</p>
      `,
      };
    }

    // 設定郵件內容

    // 發送郵件
    try {
      let send_result = await transporter.sendMail(mailOptions);
      if (send_result) {
        res.status(200).json({ message: "Email sent successfully" });
        //將領取票券資料存入DB
        if (Database.connect()) {
          Database.insertData(
            cur_time,
            names,
            username,
            numbers,
            emails,
            file_name
          );
        }
      }
    } catch (error) {
      console.error("Error sending email:", error);
      return res.status(500).json({ error: "Failed to send email" });
    }
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
});

module.exports = router;
