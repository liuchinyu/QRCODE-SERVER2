require("dotenv").config();

const router = require("express").Router();
const User = require("../models/").user;
const Record = require("../models/").record;
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const passport = require("passport");
require("../config/passport")(passport);
let file_name = "";

router.get("/record", async (req, res) => {
  let record = await Record.find();
  res.send(record);
});

router.post("/login", async (req, res) => {
  let { password } = req.body;
  try {
    let foundUser = await User.findOne({ password });

    if (foundUser) {
      const tokenObject = { _id: password };
      const token = jwt.sign(tokenObject, process.env.PASSPORT_SECRET);
      return res.send({ data: foundUser, token: "JWT " + token });
    } else {
      return res.status(401).send("識別碼輸入錯誤");
    }
  } catch (e) {
    console.log(e);
  }
});

router.post(
  "/update_data",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    let { password, ticket_left } = req.body;
    try {
      let result = await User.findOneAndUpdate(
        { password },
        { ticket_rest: ticket_left },
        {
          new: true,
          runValidators: true,
        }
      ).exec();
      return result ? res.send(result) : res.status(500).send("更新資料庫失敗");
    } catch (e) {
      console.log(e);
    }
  }
);

//QRCODE轉檔
cloudinary.config({
  cloud_name: process.env.cloud_name,
  api_key: process.env.api_key,
  api_secret: process.env.api_secret,
});

const saveQRCodeToBuffer = (base64Image) => {
  const base64Data = base64Image.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64Data, "base64");
};

const uploadQRCodeToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "qrcodes" },
      (error, result) => {
        if (error) {
          console.error("Error uploading to Cloudinary:", error);
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(buffer);
  });
};

router.post("/user-send-email", async (req, res) => {
  if (req.method === "POST") {
    //日期格式轉換
    let cur_time = new Date();
    let formattedString = cur_time.toLocaleString();
    cur_time = formattedString.slice(0, 10).trim(); //領票日期

    const {
      qrCodeUrl,
      company,
      names,
      seat,
      username,
      numbers,
      kidNumbers,
      emails,
      ticketNum,
    } = req.body;
    let domain = emails.split("@")[1]; //取得domain

    // 保存多個 QR 碼並上傳到 Cloudinary
    const qrCodeUrlOnCloudinary = await Promise.all(
      qrCodeUrl.map(async (qrCodeUrl, index) => {
        const buffer = saveQRCodeToBuffer(qrCodeUrl);
        return await uploadQRCodeToCloudinary(buffer);
      })
    );
    // 保存base64圖片到伺服器
    // const filePath = saveQRCodeToFile(qrCodeUrl);

    // 上傳到 Cloudinary 並獲取公開的 URL

    // 設定郵件傳輸服務
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.user,
        pass: process.env.password,
      },
    });

    const attachments = qrCodeUrl.map((url, index) => {
      return {
        filename: `XGEN${ticketNum + 1 + index}.png`,
        content: url.split(";base64,").pop(),
        encoding: "base64",
      };
    });

    let mailOptions = "";

    //領票數量兩張以上，以附檔方式寄送
    if (numbers > 1) {
      if (domain == "gmail.com") {
        mailOptions = {
          from: '"活動通知-入場電子票券" <qrcode0908@gmail.com>',
          to: emails,
          subject: "<<接棒未來，揮出夢想>>取票成功通知",
          html: `
          <p>${username} 您好，<span style="color:red">您已成功領取 ${numbers} 張入場電子票券</span></p>
          <p>附件為您所領取的入場電子票券QRCODE，</p>
          <p style="color:red">再請協助將入場電子票券QRCODE轉發給其它出席人員，每張入場電子票券QRCODE僅限1位大人使用，12歲以下的孩童可免費入場!</p>
          <p>當天於驗票口出示即可入場，期待您一同前來共襄盛舉!</p>
          <p>活動名稱：接棒未來，揮出夢想</p>
          <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
          <p>活動日期：2024年11月23日(六)</p>
          <p>活動時間：13:00~16:05</p>
          <p>公司名稱/捐款人名稱：${names}</p>
          <p>領票人姓名：${username}</p>
          <p>大人人數：${numbers}</p>
          <p>孩童人數：${kidNumbers}</p>
          <p>座位區域：${seat}</p>
          <p>票券號碼：XGEN${ticketNum + 1}~XGEN${ticketNum + numbers}</p>
          <p style="color:blue; font-size:14px;">如有票券取得之相關問題，請隨時與我們聯繫，謝謝</p>
          <p style="color:blue; font-size:14px;">客服電話：(02)2792-8788#502</p>
          <p style="color:blue; font-size:14px;">客服信箱：xgen.org.tw@gmail.com</p>
          <p style="color:blue; font-size:14px;">服務時間：週一到週五 09:00~18:00</p>
        `,
          attachments: attachments,
        };
      } else {
        mailOptions = {
          from: '"活動通知-入場電子票券" <qrcode0908@gmail.com>',
          to: emails,
          subject: "<<接棒未來，揮出夢想>>取票成功通知",
          html: `
          <p>${username} 您好，<span style="color:red">您已成功領取 ${numbers} 張入場電子票券</span></p>
          <p>附件為您所領取的入場電子票券QRCODE，</p>
          <p style="color:red">再請協助將入場電子票券QRCODE轉發給其它出席人員，每張入場電子票券QRCODE僅限1位大人使用，12歲以下的孩童可免費入場!</p>
          <p>當天於驗票口出示即可入場，期待您一同前來共襄盛舉!</p>
          <p>活動名稱：接棒未來，揮出夢想</p>
          <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
          <p>活動日期：2024年11月23日(六)</p>
          <p>活動時間：13:00~16:05</p>
          <p>公司名稱/捐款人名稱：${names}</p>
          <p>領票人姓名：${username}</p>
          <p>大人人數：${numbers}</p>
          <p>孩童人數：${kidNumbers}</p>
          <p>座位區域：${seat}</p>
          <p>票券號碼：XGEN${ticketNum + 1}~XGEN${ticketNum + numbers}</p>
          <p style="color:blue; font-size:14px;">如有票券取得之相關問題，請隨時與我們聯繫，謝謝</p>
          <p style="color:blue; font-size:14px;">客服電話：(02)2792-8788#502</p>
          <p style="color:blue; font-size:14px;">客服信箱：xgen.org.tw@gmail.com</p>
          <p style="color:blue; font-size:14px;">服務時間：週一到週五 09:00~18:00</p>
        `,
          attachments: attachments,
        };
      }
    }
    // 數量單張直接以圖片呈現
    else {
      if (domain == "gmail.com") {
        mailOptions = {
          from: '"<qrcode0908@gmail.com>"',
          to: emails,
          subject: "<<接棒未來，揮出夢想>>取票成功通知",
          html: `
            <p>${username} 您好，<span style="color:red">您已成功領取${numbers}張入場電子票券</span></p>
            <p>下方為您的入場票券QRCODE，<span style="color:red">每張入場電子票券QRCODE僅限1位大人使用，12歲以下的孩童可免費入場!</span></p>
            <p>當天於驗票口出示即可入場，期待您一同前來共襄盛舉!</p>
            <p>入場票券QRCODE</p>
            <img src="${qrCodeUrlOnCloudinary}" alt="QR Code" />
            <p>活動名稱：接棒未來，揮出夢想</p>
            <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
            <p>活動日期：2024年11月23日(六)</p>
            <p>活動時間：13:00~16:05</p>
            <p>公司名稱/捐款人名稱：${names}</p>
            <p>領票人姓名：${username}</p>
            <p>大人人數：${numbers}</p>
            <p>孩童人數：${kidNumbers}</p>
            <p>座位區域：${seat}</p>
            <p>票券號碼：XGEN${ticketNum + 1}</p>
            <p style="color:blue; font-size:14px;">如有票券取得之相關問題，請隨時與我們聯繫，謝謝</p>
            <p style="color:blue; font-size:14px;">客服電話：(02)2792-8788#502</p>
            <p style="color:blue; font-size:14px;">客服信箱：xgen.org.tw@gmail.com</p>
            <p style="color:blue; font-size:14px;">服務時間：週一到週五 09:00~18:00</p>
          `,
        };
      } else {
        mailOptions = {
          from: '"活動通知-入場電子票券" <qrcode0908@gmail.com>',
          to: emails,
          subject: "<<接棒未來，揮出夢想>>取票成功通知",
          html: `
          <p>${username} 您好，<span style="color:red">您已成功領取${numbers}張入場電子票券</span></p>
          <p>下方為您的入場票券QRCODE，<span style="color:red">每張入場電子票券QRCODE僅限1位大人使用，12歲以下的孩童可免費入場!</span></p>
          <p>當天於驗票口出示即可入場，期待您一同前來共襄盛舉!</p>
          <p>入場票券QRCODE</p>
          <img src="${qrCodeUrl}" alt="QR Code" />
          <p>活動名稱：接棒未來，揮出夢想</p>
          <p>活動地點：台北大巨蛋-台北市信義區忠孝東路四段515號</p>
          <p>活動日期：2024年11月23日(六)</p>
          <p>活動時間：13:00~16:05</p>
          <p>公司名稱/捐款人名稱：${names}</p>
          <p>領票人姓名：${username}</p>
          <p>大人人數：${numbers}</p>
          <p>孩童人數：${kidNumbers}</p>
          <p>座位區域：${seat}</p>
          <p>票券號碼：XGEN${ticketNum + 1}</p>
          <p style="color:blue; font-size:14px;">如有票券取得之相關問題，請隨時與我們聯繫，謝謝</p>
          <p style="color:blue; font-size:14px;">客服電話：(02)2792-8788#502</p>
          <p style="color:blue; font-size:14px;">客服信箱：xgen.org.tw@gmail.com</p>
          <p style="color:blue; font-size:14px;">服務時間：週一到週五 09:00~18:00</p>
        `,
        };
      }
    }

    // 設定郵件內容
    // 發送郵件
    try {
      let send_result = await transporter.sendMail(mailOptions);
      if (send_result) {
        res.status(200).json({ message: "Email sent successfully" });
        //將領取票券資料存入DB
        let length = qrCodeUrlOnCloudinary.length;
        let times = 0;
        for (; length > 0; length--) {
          if (times == 0) {
            //insertOne函式需要使用collection.
            const saveResult = await Record.collection.insertOne({
              get_ticket_date: cur_time,
              donor: names,
              taker: username,
              ticket_id: ticketNum + 1,
              ticket_count: numbers,
              ticket_kid: kidNumbers,
              seat: seat,
              email: emails,
              url: qrCodeUrlOnCloudinary[times],
            });
            times++;
          } else {
            // 針對同一個取票人只帶出取票編號、座位、URL
            const saveResult = await Record.collection.insertOne({
              get_ticket_date: "",
              donor: "",
              taker: "",
              ticket_id: ticketNum + times + 1,
              ticket_count: "",
              ticket_kid: "",
              seat: seat,
              email: "",
              url: qrCodeUrlOnCloudinary[times],
            });
            times++;
          }
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

router.get("/get-ticket-id", async (req, res) => {
  try {
    //取得資料中最小的排序，資料會以array方式return
    let foundUser = await Record.aggregate([
      { $sort: { ticket_id: -1 } },
      { $limit: 1 },
    ]);

    if (foundUser.length == 0) {
      return res.json("20240000");
    } else {
      return res.json(foundUser[0].ticket_id);
    }
  } catch (e) {
    console.log(e);
  }
});

module.exports = router;
