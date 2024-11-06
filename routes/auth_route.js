require("dotenv").config();

const router = require("express").Router();
const User = require("../models/").user;
const Record = require("../models/").record;
const Area = require("../models/").area;
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
    let { password, ticket_left, seatRest } = req.body;
    try {
      let result = await User.findOneAndUpdate(
        { password },
        { ticket_rest: ticket_left, seat_rest: seatRest },
        {
          new: true,
          runValidators: true,
        }
      ).exec();
      console.log("seatRest", seatRest);
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
      ticketLeft,
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
    // 座位變數
    let seat_area = "";
    let seat_row = 0;
    let seat_number = 0;
    let jump_arr = [];

    let full_row = 0;

    // 取得記錄裡面可坐的最小位置
    try {
      const foundUser = await Record.findOne({
        donor: "增你強股份有限公司",
        row_available: true,
      })
        .sort({ seat_row: 1, seat_number: -1 })
        .exec();
      console.log("記錄裡面的foundUser", foundUser);

      // 已領過票-->取得接續的位置
      if (foundUser) {
        seat_area = foundUser.seat_area;
        seat_row = foundUser.seat_row;
        // 匯入資料就要將起始位子-1
        seat_number = foundUser.seat_number;
      }
      console.log("記錄裡面的seat_number", seat_number);
    } catch (e) {
      console.log(e);
    }

    // 取得記錄裡面已坐滿的最小排數
    try {
      const foundUser = await Record.findOne({
        donor: "增你強股份有限公司",
        row_available: false,
      })
        .sort({ seat_row: -1 })
        .exec();
      if (foundUser) {
        full_row = foundUser.seat_row;
        console.log("坐滿人數中最大排的foundUser", foundUser);
      }
    } catch (e) {
      console.log(e);
    }

    let record_result = await Area.aggregate([
      {
        $match: {
          areaName: "增你強股份有限公司",
        },
      },
      {
        $unwind: "$areaConfigs",
      },
      {
        $sort: {
          "areaConfigs.areaNumber": 1,
        },
      },
      {
        $limit: 1,
      },
      {
        $unwind: "$areaConfigs.rowConfigs",
      },
      {
        $sort: {
          "areaConfigs.rowConfigs.rowNumber": 1,
        },
      },
      {
        $limit: 1,
      },
      {
        $project: {
          areaName: 1,
          minAreaNumber: "$areaConfigs.areaNumber",
          minRowConfig: "$areaConfigs.rowConfigs",
          jumpRules: "$areaConfigs.jumpRules", // 加入 jumpRules
        },
      },
    ]);

    let sear_result = await Area.aggregate([
      {
        $match: {
          areaName: "增你強股份有限公司",
        },
      },
      {
        $unwind: "$areaConfigs",
      },
      {
        $project: {
          areaName: 1,
          minAreaNumber: "$areaConfigs.rowConfigs",
        },
      },
    ]);

    //計算目前的座位數量
    const total_seat = sear_result[0].minAreaNumber.reduce((total, row) => {
      return total + (row.endSeat - row.startSeat);
    }, 0);
    console.log("total_seat", total_seat);

    if (numbers + kidNumbers > total_seat) {
      return res
        .status(405)
        .json({ message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!" });
    }

    // 抓取該公司第一排座位資料
    let first_seat_area = record_result[0].minAreaNumber;
    let first_seat_row = record_result[0].minRowConfig.rowNumber;
    let first_seat_number = record_result[0].minRowConfig.startSeat;
    jump_arr = record_result[0].jumpRules;
    let row_available = true;
    record_result = jump_arr.filter((item) => item.fromRow === first_seat_row);
    let first_row_available = record_result[0].row_available;

    // 若當前"已領取票券"不為公司第一排，且第一排尚未坐滿人
    if (
      seat_row > 0 &&
      seat_row != first_seat_row &&
      full_row > first_seat_row &&
      first_row_available
    ) {
      seat_row = first_seat_row;
      seat_number = first_seat_number;
      console.log("第一排尚未坐滿人");
    }

    if (seat_row == 0 && full_row == 0) {
      seat_area = first_seat_area;
      seat_row = first_seat_row;
      seat_number = first_seat_number;
      console.log("還未取票的seat_number", seat_number);
    }
    // 若取票數剛好取完當排的座位數，要於此設定取票
    else if (seat_row == 0 && full_row != 0) {
      record_result = jump_arr.filter((item) => item.fromRow === full_row);
      if (record_result[0].fromSeat == record_result[0].toSeat) {
        return res
          .status(405)
          .json({ message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!" });
      }
      seat_row = record_result[0].toRow;
      seat_number = record_result[0].toSeat;
    }

    // 取得當前座位的跳轉規則
    record_result = jump_arr.filter((item) => item.fromRow === seat_row);
    let from_seat = record_result[0].fromSeat; //當排排尾
    let to_row = record_result[0].toRow; //下一排
    let to_seat = record_result[0].toSeat; //下一排的排頭
    let times = 0;

    //領票數量兩張以上，以附檔方式寄送
    if (numbers + kidNumbers > 1) {
      if (domain == "gmail.com") {
        mailOptions = {
          from: "xgen.org.tw@gmail.com",
          to: emails,
          subject: "<<接棒未來 揮出夢想>>入場電子票券 取票成功通知",
          html: `
          <div style="font-family: 'Microsoft JhengHei', sans-serif;">
            <p>${username} 您好，<span style="color:red">您已成功領取 ${
            numbers + kidNumbers
          } 張入場電子票券</span></p>
            <p>附件為您所領取的入場電子票券QRCODE，</p>
            <p style="color:red">再請協助將入場電子票券QRCODE轉發給其它出席人員，每張入場券僅限1人使用</p>
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
            <p>票券號碼：XGEN${ticketNum + 1}~XGEN${
            ticketNum + numbers + kidNumbers
          }</p>
            <p style="color:blue; font-size:14px;">如有票券取得之相關問題，請隨時與我們聯繫，謝謝</p>
            <p style="color:blue; font-size:14px;">客服電話：(02)2792-8788#502</p>
            <p style="color:blue; font-size:14px;">客服信箱：xgen.org.tw@gmail.com</p>
            <p style="color:blue; font-size:14px;">服務時間：週一到週五 09:00~18:00</p>
          </div>
        `,
          attachments: attachments,
        };
      } else {
        mailOptions = {
          from: "xgen.org.tw@gmail.com",
          to: emails,
          subject: "<<接棒未來 揮出夢想>>入場電子票券 取票成功通知",
          html: `
          <div style="font-family: 'Microsoft JhengHei', sans-serif;">
            <p>${username} 您好，<span style="color:red">您已成功領取 ${
            numbers + kidNumbers
          } 張入場電子票券</span></p>
            <p>附件為您所領取的入場電子票券QRCODE，</p>
            <p style="color:red">再請協助將入場電子票券QRCODE轉發給其它出席人員，每張入場券僅限1人使用</p>
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
            <p>票券號碼：XGEN${ticketNum + 1}~XGEN${
            ticketNum + numbers + kidNumbers
          }</p>
            <p style="color:blue; font-size:14px;">如有票券取得之相關問題，請隨時與我們聯繫，謝謝</p>
            <p style="color:blue; font-size:14px;">客服電話：(02)2792-8788#502</p>
            <p style="color:blue; font-size:14px;">客服信箱：xgen.org.tw@gmail.com</p>
            <p style="color:blue; font-size:14px;">服務時間：週一到週五 09:00~18:00</p>
          </div>
        `,
          attachments: attachments,
        };
      }
    }
    // 數量單張直接以圖片呈現
    else {
      if (domain == "gmail.com") {
        mailOptions = {
          from: "xgen.org.tw@gmail.com",
          to: emails,
          subject: "<<接棒未來 揮出夢想>>入場電子票券 取票成功通知",
          html: `
          <div style="font-family: 'Microsoft JhengHei', sans-serif;">
            <p>${username} 您好，<span style="color:red">您已成功領取${numbers}張入場電子票券</span></p>
            <p>下方為您的入場票券QRCODE，<span style="color:red">每張入場券僅限1人使用</span></p>
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
          </div>
          `,
        };
      } else {
        mailOptions = {
          from: "xgen.org.tw@gmail.com",
          to: emails,
          subject: "<<接棒未來 揮出夢想>>入場電子票券 取票成功通知",
          html: `
          <div style="font-family: 'Microsoft JhengHei', sans-serif;">
            <p>${username} 您好，<span style="color:red">您已成功領取${numbers}張入場電子票券</span></p>
            <p>下方為您的入場票券QRCODE，<span style="color:red">每張入場券僅限1人使用</span></p>
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
          </div>
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
              ticket_left: ticketLeft,
              // 區域
              seat_area: seat,
              seat_row: seat_row,
              seat_number: ++seat_number,
              row_available: row_available,
              email: emails,
              url: qrCodeUrlOnCloudinary[times],
            });
            times++;
            if (seat_number == from_seat) {
              row_available = false;
              try {
                let update_record = await Record.updateMany(
                  { donor: names, seat_row: seat_row },
                  { row_available: false }
                );

                console.log("update_record", update_record);
              } catch (e) {
                console.log(e);
              }
            }
          } else {
            // 針對同一個取票人只帶出取票編號、座位、URL

            if (++seat_number <= from_seat) {
              // row_available = true;
              if (seat_number == from_seat) {
                row_available = false;
                try {
                  let update_record = await Record.updateMany(
                    { donor: names, seat_row: seat_row },
                    { row_available: false }
                  );

                  // console.log("update_record", update_record);
                } catch (e) {
                  console.log(e);
                }
                console.log("當排:", seat_row, "最後一位", from_seat);
              }
              // console.log("當前的排尾", from_seat);
              // console.log("當前的座位", seat_number);
            } else {
              // 超過當排的座位
              console.log("跳轉seat_row", seat_row);
              // 取得跳轉下一排之資訊
              record_result = jump_arr.filter(
                (item) => item.fromRow === seat_row
              );
              if (
                record_result[0].fromRow == record_result[0].toRow &&
                record_result[0].fromSeat == record_result[0].toSeat &&
                seat_number > record_result[0].toSeat
              ) {
                return res.status(405).json({
                  message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!",
                });
              }
              // from_seat = record_result[0].fromSeat; //取得當排的排尾
              to_row = record_result[0].toRow; //取得下一排
              seat_row = to_row;
              seat_number = record_result[0].toSeat + 1; //取得下一排的排頭
              row_available = true;
              console.log("提換過的seat_row", seat_row);
              console.log("提換過的seat_number", seat_number);

              let record_result_next = jump_arr.filter(
                (item) => item.fromRow === seat_row
              );
              console.log("record_result_next", record_result_next);
              if (record_result_next.length > 0) {
                // 取得下排的容納座位
                from_seat = record_result_next[0].fromSeat;
              } else {
                from_seat = record_result[0].fromSeat;
              }
            }

            const saveResult = await Record.collection.insertOne({
              get_ticket_date: "",
              donor: names,
              taker: "",
              ticket_id: ticketNum + times + 1,
              ticket_count: "",
              ticket_kid: "",
              ticket_left: "",

              seat_area: seat,
              seat_row: seat_row,
              seat_number: seat_number,
              row_available: row_available,
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
