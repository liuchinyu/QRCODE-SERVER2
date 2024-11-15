require("dotenv").config();

const router = require("express").Router();
const User = require("../models/").user;
const Record = require("../models/").record;
const TmpRecord = require("../models/").tmpRecord;
const MailRecord = require("../models").mailRecord;
const Area = require("../models/").area;
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const passport = require("passport");
const { tmpRecord } = require("../models/");
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

router.get("/getBufferNum", async (req, res) => {
  let check = await User.findOne({ name: "Buffer區" });
  if (check) {
    return res.send({ data: check.seat_rest });
  } else return res.status(401).send("0");
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
      // console.log("seatRest", seatRest);
      return result ? res.send(result) : res.status(500).send("更新資料庫失敗");
    } catch (e) {
      console.log(e);
    }
  }
);

router.post(
  "/update_buffer_data",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    let { bufferRest } = req.body;
    try {
      let result = await User.findOneAndUpdate(
        { name: "Buffer區" },
        { seat_rest: bufferRest },
        {
          new: true,
          runValidators: true,
        }
      ).exec();
      console.log("bufferRest", bufferRest);
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

    let {
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
    let seat_area = 0;
    let seat_row = 0;
    let seat_number = 0;
    let jump_arr = [];
    let jump_buffer_arr = [];
    let full_row = 0;
    let jumpBuffer = false;
    let mailJump = false;

    //取得參加名單第一排清單及跳轉規則
    let record_result = await Area.aggregate([
      {
        $match: {
          areaName: names,
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
    let buffer_record_result = await Area.aggregate([
      {
        $match: {
          areaName: "Buffer區",
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
    let first_seat_area = record_result[0].minAreaNumber;
    let first_seat_row = record_result[0].minRowConfig.rownumber;
    let first_seat_number = record_result[0].minRowConfig.startSeat;
    jump_arr = record_result[0].jumpRules;
    jump_buffer_arr = buffer_record_result[0].jumpRules;
    let row_available = true;
    record_result = jump_arr.filter((item) => item.fromRow === first_seat_row);
    let first_row_available = record_result[0].row_available;

    // 取得記錄裡面不屬於Buffer區可坐的最小位置
    let recordUser = "";
    let bufferUser = "";
    try {
      recordUser = await Record.findOne({
        donor: names,
        row_available: true,
        buffer_area: false,
      })
        .sort({ seat_row: 1, seat_number: -1 })
        .exec();
    } catch (e) {
      console.log(e);
    }
    // console.log()
    // 先將座位區坐滿才跳轉到Buffer區-->取得接續的位置
    if (recordUser) {
      seat_area = recordUser.seat_area;
      seat_row = recordUser.seat_row;
      seat_number = recordUser.seat_number;
    }
    // console.log("248--recordUser", recordUser);

    // 取得記錄裡面不屬於Buffer區已坐滿的最大排數
    // 不一定是空位區坐滿才跳轉到Buffer區
    // 有可能因為小孩連號而先跳轉到Buffer區
    try {
      const foundUser = await Record.findOne({
        donor: names,
        row_available: false,
        buffer_area: false,
      })
        .sort({ seat_row: -1 })
        .exec();
      if (foundUser) {
        full_row = foundUser.seat_row;
      }
    } catch (e) {
      console.log(e);
    }

    // 若當前"已領取票券"不為公司第一排，且第一排尚未坐滿人(有跳轉過，但都沒有排數坐滿)
    // 給定第一排座位
    if (seat_row == 0 && full_row == 0) {
      seat_area = first_seat_area;
      seat_row = first_seat_row;
      seat_number = first_seat_number;
      // console.log("還未取票的seat_number", seat_number);
    }
    // 若取票數剛好取完當排的座位數，要於此設定取票(下一排的排頭)
    else if (seat_row == 0 && full_row != 0) {
      record_result = jump_arr.filter((item) => item.fromRow === full_row);
      if (
        record_result[0].fromRow == record_result[0].toRow &&
        record_result[0].fromSeat == record_result[0].toSeat &&
        record_result[0].fromArea == record_result[0].toArea &&
        seat_number > record_result[0].toSeat
      ) {
        return res
          .status(405)
          .json({ message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!" });
      }
      seat_area = record_result[0].toArea;
      seat_row = record_result[0].toRow;
      seat_number = record_result[0].toSeat;
      // 判斷是否已跳轉到Buffer區，從Buffer區中接續指定座位
      record_result = jump_arr.filter((item) => item.fromRow === seat_row);
      // console.log("record_result[0]", record_result[0]);
    }

    let from_area = "";
    let from_row = "";
    let from_seat = ""; //當排排尾
    let to_row = ""; //下一排
    let to_seat = ""; //下一排的排頭
    let to_area = "";
    let times = 0;
    // 取得當前座位的跳轉規則
    record_result = jump_arr.filter((item) => item.fromRow === seat_row);

    if (record_result[0]) {
      from_area = record_result[0].fromArea;
      from_row = record_result[0].fromRow;
      from_seat = record_result[0].fromSeat; //當排排尾
      to_row = record_result[0].toRow; //下一排
      to_seat = record_result[0].toSeat; //下一排的排頭
      to_area = record_result[0].toArea;
    }

    // 有小孩且當前座位不足以給小孩坐，跳轉至下一排的排頭

    seat = seat_area;

    let mail_length = qrCodeUrlOnCloudinary.length;
    let mail_times = 0;
    let mail_number = seat_number;
    let mail_from_seat = from_seat;
    let mail_seat_row = seat_row;
    let mail_seat_area = seat_area;
    let mail_row_available = true;
    let mail_to_row = to_row;
    let mail_to_area = to_area;

    // 儲存跨排寄送mail資訊
    let mail_obj = {
      mail_seat_area: mail_seat_area,
      mail_seat_row: mail_seat_row,
      mail_number: mail_number + 1,
    };
    // 將調整好的第一筆資料存入
    let mail_record = [];
    mail_record.push(mail_obj);

    for (; mail_length > 0; mail_length--) {
      if (mail_times == 0) {
        await MailRecord.collection.insertOne({
          get_ticket_date: cur_time,
          donor: names,
          taker: username,
          ticket_id: ticketNum + 1,
          ticket_count: numbers,
          ticket_kid: kidNumbers,
          ticket_left: ticketLeft,
          // 區域
          seat_area: mail_seat_area,
          seat_row: mail_seat_row,
          seat_number: ++mail_number,
          row_available: mail_row_available,
          buffer_area: mailJump ? true : false,
          email: emails,
          url: "qrCodeUrlOnCloudinary[times]",
        });
        mail_times++;

        if (mail_number == mail_from_seat) {
          mail_row_available = false;
          try {
            await MailRecord.updateMany(
              { donor: names, seat_row: mail_seat_row },
              { row_available: false }
            );
          } catch (e) {
            console.log(e);
          }
          let mail_obj = {
            mail_seat_area: mail_seat_area,
            mail_seat_row: mail_seat_row,
            mail_number: mail_number,
          };
          mail_record.push(mail_obj);
        }
      } else {
        // 不為第一筆之資料
        if (++mail_number <= mail_from_seat) {
          // row_available = true;
          if (mail_number == mail_from_seat) {
            mail_row_available = false;
            if (!jumpBuffer) {
              try {
                await MailRecord.updateMany(
                  { donor: names, seat_row: mail_seat_row },
                  { row_available: false }
                );
              } catch (e) {
                console.log(e);
              }
            } else {
              try {
                await MailRecord.updateMany(
                  { seat_row: mail_seat_row, buffer_area: true },
                  { row_available: false }
                );
              } catch (e) {
                console.log(e);
              }
            }
            // 儲存當排最後一位的資料for Mail傳送資料
            let mail_obj = {
              mail_seat_area: mail_seat_area,
              mail_seat_row: mail_seat_row,
              mail_number: mail_number,
            };
            mail_record.push(mail_obj);
          }
        } else {
          // 超過當排的座位
          // 取得跳轉下一排之資訊

          record_result = jump_arr.filter(
            (item) => item.fromRow === mail_seat_row
          );
          buffer_record_result = jump_buffer_arr.filter(
            (item) =>
              item.fromRow === mail_seat_row && item.fromArea === mail_seat_area
          );
          if (record_result[0]) {
            if (
              record_result[0].fromRow == record_result[0].toRow &&
              record_result[0].fromSeat == record_result[0].toSeat &&
              seat_number > record_result[0].toSeat
            ) {
              return res.status(405).json({
                message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!",
              });
            }
          }

          mail_to_row = record_result[0].toRow; //取得下一排
          mail_to_area = record_result[0].toArea;
          mail_seat_row = mail_to_row;
          mail_seat_area = mail_to_area;

          // 取得記錄裡面判斷該欄是否已有座位
          let foundUser = await MailRecord.findOne({
            donor: names,
            row_available: true,
            seat_row: mail_seat_row,
          }).sort({ seat_number: -1 });

          // 分配座位
          if (foundUser) {
            mail_number = foundUser.seat_number + 1;
            mail_seat_area = foundUser.seat_area;
          } else {
            // 跳了下一行後，若跨越到大Buffer區不會取得存在大Buffer區的人
            mail_number = record_result[0].toSeat + 1; //取得下一排的排頭
            mail_seat_area = record_result[0].toArea;
          }

          // from_seat = record_result[0].fromSeat; //取得當排的排尾
          mail_row_available = true;

          if (!mailJump) {
            let record_result_next = jump_arr.filter(
              (item) => item.fromRow === mail_seat_row
            );
            if (mail_number == record_result_next[0].fromSeat) {
              mail_row_available = false;
              try {
                await MailRecord.updateMany(
                  { donor: names, seat_row: mail_seat_row },
                  { row_available: false }
                );
              } catch (e) {
                console.log(e);
              }
            }
            if (record_result_next.length > 0) {
              // 取得下排的容納座位
              mail_from_seat = record_result_next[0].fromSeat;
              if (record_result_next[0].bufferArea) {
                mailJump = true;
              }
            } else {
              mail_from_seat = record_result[0].fromSeat;
            }
          } else {
            let record_result_next = jump_buffer_arr.filter(
              (item) => item.fromRow === mail_seat_row
            );
            if (mail_number == record_result_next[0].fromSeat) {
              mail_row_available = false;
              try {
                await MailRecord.updateMany(
                  { seat_row: mail_seat_row, buffer_area: true },
                  { row_available: false }
                );
              } catch (e) {
                console.log(e);
              }
            }

            if (record_result_next.length > 0) {
              // 取得下排的容納座位
              mail_from_seat = record_result_next[0].fromSeat;
              if (record_result_next[0].bufferArea) {
                mailJump = true;
              }
            } else {
              mail_from_seat = buffer_record_result[0].fromSeat;
            }
          }

          mail_obj = {
            mail_seat_area: mail_seat_area,
            mail_seat_row: mail_seat_row,
            mail_number: mail_number,
          };
          mail_record.push(mail_obj);
          //上方為超越當排
        }
        MailRecord.collection.insertOne({
          get_ticket_date: "",
          donor: names,
          taker: "",
          ticket_id: ticketNum + times + 1,
          ticket_count: "",
          ticket_kid: "",
          ticket_left: "",

          seat_area: mail_seat_area,
          seat_row: mail_seat_row,
          seat_number: mail_number,
          row_available: mail_row_available,
          buffer_area: mailJump ? true : false,
          email: "",
          url: "qrCodeUrlOnCloudinary[times],",
        });

        mail_times++;
      }
    }
    // 迴圈已結束
    if (mail_obj.mail_number != mail_number) {
      mail_obj = {
        mail_seat_area: mail_seat_area,
        mail_seat_row: mail_seat_row,
        mail_number: mail_number,
      };
      mail_record.push(mail_obj);
    }
    console.log("外部的mail_obj", mail_obj);
    // console.log("mail_record", mail_record);

    let seatDetails = [];
    let currentAreaRow = "";

    mail_record.forEach((record) => {
      const areaRow = `${record.mail_seat_area}區${record.mail_seat_row}排`;

      if (currentAreaRow === areaRow) {
        // 檢查最後一個座位範圍是否已經包含該號碼
        const lastSeatDetail = seatDetails[seatDetails.length - 1];
        if (!lastSeatDetail.includes(`~${record.mail_number}號`)) {
          seatDetails[seatDetails.length - 1] += `~${record.mail_number}號`;
        }
      } else {
        if (currentAreaRow) {
          seatDetails.push("、");
        }
        seatDetails.push(`${areaRow}${record.mail_number}號`);
        currentAreaRow = areaRow;
      }
    });

    // 將最後一組的座位號碼用 ~ 連接
    let result = seatDetails.join("").replace(/、$/, ""); // 去掉最後的逗號
    // 將每個座位的描述用逗號分隔

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
            <p>活動時間：13:00~16:00</p>
            <p>公司名稱/捐款人名稱：${names}</p>
            <p>領票人姓名：${username}</p>
            <p>大人人數：${numbers}</p>
            <p>孩童人數：${kidNumbers}</p>
            <p>座位區域：${result}</p>
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
            <p>活動時間：13:00~16:00</p>
            <p>公司名稱/捐款人名稱：${names}</p>
            <p>領票人姓名：${username}</p>
            <p>大人人數：${numbers}</p>
            <p>孩童人數：${kidNumbers}</p>
            <p>座位區域：${result}</p>
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
            <p>活動時間：13:00~16:00</p>
            <p>公司名稱/捐款人名稱：${names}</p>
            <p>領票人姓名：${username}</p>
            <p>大人人數：${numbers}</p>
            <p>孩童人數：${kidNumbers}</p>
            <p>座位：${seat_area}區${seat_row}排${seat_number + 1}號</p>
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
            <p>活動時間：13:00~16:00</p>
            <p>公司名稱/捐款人名稱：${names}</p>
            <p>領票人姓名：${username}</p>
            <p>大人人數：${numbers}</p>
            <p>孩童人數：${kidNumbers}</p>
            <p>座位：${seat_area}區${seat_row}排${seat_number + 1}號</p>
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
        seat = seat_area;
        console.log("1060row_available", row_available);
        for (; length > 0; length--) {
          if (times == 0) {
            //insertOne函式需要使用collection.
            await Record.collection.insertOne({
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
              buffer_area: jumpBuffer ? true : false,
              email: emails,
              url: qrCodeUrlOnCloudinary[times],
            });

            times++;

            if (seat_number == from_seat) {
              row_available = false;
              if (!jumpBuffer) {
                try {
                  await Record.updateMany(
                    { donor: names, seat_row: seat_row },
                    { row_available: false }
                  );
                } catch (e) {
                  console.log(e);
                }
              } else {
                try {
                  await Record.updateMany(
                    { seat_row: seat_row, buffer_area: true },
                    { row_available: false }
                  );
                } catch (e) {
                  console.log(e);
                }
              }
            }
          } else {
            // 針對同一個取票人只帶出取票編號、座位、URL

            if (++seat_number <= from_seat) {
              // row_available = true;
              if (seat_number == from_seat) {
                row_available = false;
                if (!jumpBuffer) {
                  try {
                    await Record.updateMany(
                      { donor: names, seat_row: seat_row },
                      { row_available: false }
                    );
                  } catch (e) {
                    console.log(e);
                  }
                } else {
                  try {
                    await Record.updateMany(
                      { seat_row: seat_row, buffer_area: true },
                      { row_available: false }
                    );
                  } catch (e) {
                    console.log(e);
                  }
                }
                // console.log("當排:", seat_row, "最後一位", from_seat);
              }
            } else {
              // 超過當排的座位
              // 取得跳轉下一排之資訊
              record_result = jump_arr.filter(
                (item) => item.fromRow === seat_row
              );
              buffer_record_result = jump_buffer_arr.filter(
                (item) => item.fromRow === seat_row
              );

              if (record_result[0]) {
                if (
                  record_result[0].fromRow == record_result[0].toRow &&
                  record_result[0].fromSeat == record_result[0].toSeat &&
                  seat_number > record_result[0].toSeat
                ) {
                  return res.status(405).json({
                    message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!",
                  });
                }
              }

              to_row = record_result[0].toRow; //取得下一排
              to_area = record_result[0].toArea;
              seat_row = to_row;
              seat_area = to_area;
              // 取得記錄裡面判斷該欄是否已有座位
              let foundUser = await Record.findOne({
                donor: names,
                row_available: true,
                seat_row: seat_row,
              }).sort({ seat_number: -1 });

              if (foundUser) {
                seat_number = foundUser.seat_number + 1;
                seat_area = foundUser.seat_area;
              } else {
                // 跳了下一行後，若跨越到大Buffer區不會取得存在大Buffer區的人
                seat_number = record_result[0].toSeat + 1; //取得下一排的排頭
                seat_area = record_result[0].toArea;
              }

              row_available = true;
              if (!jumpBuffer) {
                let record_result_next = jump_arr.filter(
                  (item) => item.fromRow === seat_row
                );

                console.log("seat_area1311", seat_area);
                console.log("seat_row1312", seat_row);
                console.log("seat_number1313", seat_number);

                if (seat_number == record_result_next[0].fromSeat) {
                  row_available = false;
                  console.log("seat_row", seat_row);
                  try {
                    await Record.updateMany(
                      { donor: names, seat_row: seat_row },
                      { row_available: false }
                    );
                  } catch (e) {
                    console.log(e);
                  }
                }

                if (record_result_next.length > 0) {
                  // 取得下排的容納座位
                  from_seat = record_result_next[0].fromSeat;
                } else {
                  from_seat = record_result[0].fromSeat;
                }
              }
            }
            seat = seat_area;

            await Record.collection.insertOne({
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
              buffer_area: jumpBuffer ? true : false,
              email: "",
              url: qrCodeUrlOnCloudinary[times],
            });

            let record_result_next = jump_arr.filter(
              (item) => item.fromRow === seat_row
            );

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

// 取得票券編號
router.get("/get-ticket-id", async (req, res) => {
  try {
    //取得資料中最大的排序，資料會以array方式return
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

// 回傳QRCODE裡面的資料
router.post("/get-seat-number", async (req, res) => {
  let {
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

  const seatAreas = []; // 儲存所有座位區域的陣列
  const seatInfo = {
    seat: "",
    seat_row: "",
    seat_number: "",
  };

  let seat_area = 0;
  let seat_row = 0;
  let seat_number = 0;
  let jump_arr = [];
  let jump_buffer_arr = [];
  let full_row = 0;
  let jumpBuffer = false;

  //取得參加名單第一排清單及跳轉規則
  let record_result = await Area.aggregate([
    {
      $match: {
        areaName: names,
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
  let buffer_record_result = await Area.aggregate([
    {
      $match: {
        areaName: "Buffer區",
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
  console.log("record_result", record_result[0]);
  let first_seat_area = record_result[0].minAreaNumber;
  let first_seat_row = record_result[0].minRowConfig.rownumber;
  let first_seat_number = record_result[0].minRowConfig.startSeat;
  jump_arr = record_result[0].jumpRules;
  jump_buffer_arr = buffer_record_result[0].jumpRules;
  let row_available = true;
  console.log("first_seat_row", first_seat_row);
  record_result = jump_arr.filter((item) => item.fromRow === first_seat_row);
  console.log("record_result2", record_result[0]);
  // console.log("first_seat_row", first_seat_row);
  let first_row_available = record_result[0].row_available;

  // 取得記錄裡面不屬於Buffer區可坐的最小位置
  let tmp_recordUser = "";
  let tmp_bufferUser = "";

  try {
    tmp_recordUser = await TmpRecord.findOne({
      donor: names,
      row_available: true,
      buffer_area: false,
    })
      .sort({ seat_row: 1, seat_number: -1 })
      .exec();
  } catch (e) {
    console.log(e);
  }
  // console.log()
  // 先將座位區坐滿才跳轉到Buffer區-->取得接續的位置
  if (tmp_recordUser) {
    seat_area = tmp_recordUser.seat_area;
    seat_row = tmp_recordUser.seat_row;
    seat_number = tmp_recordUser.seat_number;
    // console.log("1122tmp_recordUser", tmp_recordUser);
  }

  try {
    const foundUser = await TmpRecord.findOne({
      donor: names,
      row_available: false,
      buffer_area: false,
    })
      .sort({ seat_row: -1 })
      .exec();
    if (foundUser) {
      full_row = foundUser.seat_row;
    }
  } catch (e) {
    console.log(e);
  }

  // console.log("record_result", record_result);

  // 若當前"已領取票券"不為公司第一排，且第一排尚未坐滿人
  if (seat_row == 0 && full_row == 0) {
    seat_area = first_seat_area;
    seat_row = first_seat_row;
    seat_number = first_seat_number;
  }
  // 若取票數剛好取完當排的座位數，要於此設定取票
  else if (seat_row == 0 && full_row != 0) {
    record_result = jump_arr.filter((item) => item.fromRow === full_row);
    if (
      record_result[0].fromRow == record_result[0].toRow &&
      record_result[0].fromSeat == record_result[0].toSeat &&
      record_result[0].fromArea == record_result[0].toArea &&
      seat_number > record_result[0].toSeat
    ) {
      return res
        .status(405)
        .json({ message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!" });
    }
    seat_area = record_result[0].toArea;
    seat_row = record_result[0].toRow;
    seat_number = record_result[0].toSeat;

    record_result = jump_arr.filter((item) => item.fromRow === seat_row);

    if (record_result[0].bufferArea) {
      //因為Buffer區可能已被其他公司取位，要取得記錄裡面屬於Buffer區可坐的最小位置
      jumpBuffer = true;
      try {
        bufferUser = await TmpRecord.findOne({
          row_available: true,
          buffer_area: true,
        })
          .sort({ seat_row: 1, seat_number: -1 })
          .exec();
      } catch (e) {
        console.log(e);
      }
      if (bufferUser) {
        seat_area = bufferUser.seat_area;
        seat_row = bufferUser.seat_row;
        seat_number = bufferUser.seat_number;
      } else {
        // 判斷Buffer區是否剛好坐滿人
        try {
          const foundUser = await TmpRecord.findOne({
            row_available: false,
            buffer_area: true,
          })
            .sort({ seat_row: -1 })
            .exec();
          if (foundUser) {
            full_row = foundUser.seat_row;
            buffer_record_result = jump_buffer_arr.filter(
              (item) => item.fromRow === full_row && item.fromArea == true
            );
            if (
              buffer_record_result[0].fromRow ==
                buffer_record_result[0].toRow &&
              buffer_record_result[0].fromSeat ==
                buffer_record_result[0].toSeat &&
              buffer_record_result[0].fromArea ==
                buffer_record_result[0].toArea &&
              seat_number > buffer_record_result[0].toSeat
            ) {
              return res.status(405).json({
                message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!",
              });
            }
            seat_area = buffer_record_result[0].toArea;
            seat_row = buffer_record_result[0].toRow;
            seat_number = buffer_record_result[0].toSeat;
          }
        } catch (e) {
          console.log(e);
        }
      }
    }
  }

  let from_area = "";
  let from_row = "";
  let from_seat = ""; //當排排尾
  let to_row = ""; //下一排
  let to_seat = ""; //下一排的排頭
  let to_area = "";
  let times = 0;

  // 取得當前座位的跳轉規則
  record_result = jump_arr.filter((item) => item.fromRow === seat_row);
  buffer_record_result = jump_buffer_arr.filter(
    (item) => item.fromRow === seat_row && item.fromArea == true
  );
  // console.log("seat_row", seat_row);
  // console.log("record_result", record_result);
  if (record_result[0]) {
    from_area = record_result[0].fromArea;
    from_row = record_result[0].fromRow;
    from_seat = record_result[0].fromSeat; //當排排尾
    to_row = record_result[0].toRow; //下一排
    to_seat = record_result[0].toSeat; //下一排的排頭
    to_area = record_result[0].toArea;
  }

  // console.log("1234當前位置", seat_area, "-", seat_row, "-", seat_number);

  // 有小孩且當前座位不足以給小孩坐，跳轉至下一排的排頭

  seat = seat_area;
  let length = numbers + kidNumbers;

  for (; length > 0; length--) {
    if (times == 0) {
      // insertOne函式需要使用collection.
      await TmpRecord.collection.insertOne({
        get_ticket_date: "",
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
        buffer_area: jumpBuffer ? true : false,
        email: emails,
        url: "url",
      });
      times++;
      const newSeatInfo = {
        seat: seat,
        seat_row: seat_row,
        seat_number: seat_number,
      };
      seatAreas.push(newSeatInfo);

      if (seat_number == from_seat) {
        row_available = false;
        if (!jumpBuffer) {
          try {
            await TmpRecord.updateMany(
              { donor: names, seat_row: seat_row },
              { row_available: false }
            );
          } catch (e) {
            console.log(e);
          }
        }
      }
    } else {
      // 針對同一個取票人只帶出取票編號、座位、URL

      if (++seat_number <= from_seat) {
        // row_available = true;
        if (seat_number == from_seat) {
          row_available = false;
          if (!jumpBuffer) {
            try {
              await TmpRecord.updateMany(
                { donor: names, seat_row: seat_row },
                { row_available: false }
              );
            } catch (e) {
              console.log(e);
            }
          }
        }
      } else {
        // 超過當排的座位
        // 取得跳轉下一排之資訊
        // console.log("1455seat_row", seat_row); //超過的排數
        // console.log("record_result1456", record_result[0]);
        record_result = jump_arr.filter((item) => item.fromRow === seat_row);
        buffer_record_result = jump_buffer_arr.filter(
          (item) => item.fromRow === seat_row && item.fromArea === seat_area
        );
        // console.log("1762seat_row", seat_row);
        if (record_result[0]) {
          if (
            record_result[0].fromRow == record_result[0].toRow &&
            record_result[0].fromSeat == record_result[0].toSeat &&
            seat_number > record_result[0].toSeat
          ) {
            return res.status(405).json({
              message: "票券已全數領取完畢，如有問題請與相關窗口聯絡!",
            });
          }
        }
        // console.log("record_result", record_result[0]);

        to_row = record_result[0].toRow; //取得下一排
        to_area = record_result[0].toArea;
        seat_row = to_row;
        seat_area = to_area;
        // 取得記錄裡面判斷該欄是否已有座位
        let foundUser = await TmpRecord.findOne({
          donor: names,
          row_available: true,
          seat_row: seat_row,
        }).sort({ seat_number: -1 });

        if (foundUser) {
          seat_number = foundUser.seat_number + 1;
          seat_area = foundUser.seat_area;
        } else {
          // 跳了下一行後，若跨越到大Buffer區不會取得存在大Buffer區的人
          // console.log("確認buffer_record_result", buffer_record_result[0]);
          seat_number = record_result[0].toSeat + 1; //取得下一排的排頭
          seat_area = record_result[0].toArea;
        }
        // console.log("1475跳轉後seat_row", seat_row);
        row_available = true;

        if (!jumpBuffer) {
          let record_result_next = jump_arr.filter(
            (item) => item.fromRow === seat_row
          );
          if (seat_number == record_result_next[0].fromSeat) {
            row_available = false;
            // console.log("seat_row", seat_row);
            try {
              await TmpRecord.updateMany(
                { donor: names, seat_row: seat_row },
                { row_available: false }
              );
            } catch (e) {
              console.log(e);
            }
          }

          if (record_result_next.length > 0) {
            // 取得下排的容納座位
            from_seat = record_result_next[0].fromSeat;
            if (record_result_next[0].bufferArea) {
              jumpBuffer = true;
            }
          } else {
            from_seat = record_result[0].fromSeat;
          }
        }
      }
      seat = seat_area;

      await TmpRecord.collection.insertOne({
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
        buffer_area: jumpBuffer ? true : false,
        email: "",
        url: "qrCodeUrlOnCloudinary[times],",
      });

      const newSeatInfo = {
        seat: seat,
        seat_row: seat_row,
        seat_number: seat_number,
      };
      seatAreas.push(newSeatInfo);
      times++;
    }
  }
  console.log("seatAreas", seatAreas);
  return res
    .status(200)
    .json({ message: "Email sent successfully", seatAreas });
});
module.exports = router;
