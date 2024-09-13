const oracledb = require("oracledb");

class Database {
  constructor() {
    this.connection = null;
  }

  // 連接資料庫
  async connect() {
    try {
      if (!this.connection) {
        this.connection = await oracledb.getConnection({
          user: "B2B",
          password: "b2b",
          connectString: "10.1.1.15:1521/B2BDB",
        });
        console.log("資料庫連接已建立");
      }
      return this.connection; //紀錄連結資料
    } catch (e) {
      console.log(e);
    }
  }
  async getAccount(password) {
    try {
      const connection = await this.connect();
      if (connection) {
        const result = await connection.execute(
          `SELECT TYPE, NAME, ALL_TICKET, TICKET_REST, SEAT FROM QRCODE_ACCOUNT WHERE PASSWORD = :password`,
          { password: password }
        );
        return result; // 如果存在匹配的驗證碼，返回 true

        // console.log("result", result);
      }
    } catch (e) {
      console.log(e);
    }
    // finally {
    //   if (this.connection) {
    //     try {
    //       await this.connection.close();
    //     } catch (e) {
    //       console.log(e);
    //     }
    //   }
    // }
  }

  async getAccount_person(password) {
    try {
      const connection = await this.connect();
      console.log("password", password);
      if (connection) {
        const result = await connection.execute(
          `SELECT * FROM QRCODE_ACCOUNT_PERSON WHERE PASSWORD = :password`,
          { password: password }
        );
        console.log("result_person", result);
        return result; // 如果存在匹配的驗證碼，返回 true

        console.log("result", result);
      }
    } catch (e) {
      console.log(e);
    }
    // finally {
    //   if (this.connection) {
    //     try {
    //       await this.connection.close();
    //     } catch (e) {
    //       console.log(e);
    //     }
    //   }
    // }
  }

  async insertData(cur_time, names, username, numbers, emails, filename) {
    try {
      const connection = await this.connect();
      if (connection) {
        // console.log("cur_time", typeof cur_time);

        const result = await connection.execute(
          // 使用綁定變數，避免 SQL 注入
          `INSERT INTO TICKET_RECORD VALUES(:cur_time, :names, :username, :numbers, :emails, :filename)`,
          // 提供綁定變數的值
          {
            cur_time: cur_time,
            names: names,
            username: username,
            numbers: numbers,
            emails: emails,
            filename: filename,
          }
        );
        await connection.commit();
        console.log("資料Insert成功");
      } else {
        console.log("連接失敗");
      }
    } catch (e) {
      console.error(e); // 使用 console.error 打印錯誤訊息
    }
  }

  async updateData(password, ticket_count) {
    try {
      const connection = await this.connect();
      if (connection) {
        console.log("ttt");
        const result = await connection.execute(
          // `UPDATE QRCODE_ACCOUNT SET SEAT = 'B' WHERE PASSWORD = 'AQZ213'`
          `UPDATE QRCODE_ACCOUNT SET TICKET_REST = :ticket_count WHERE PASSWORD = :password`,
          {
            ticket_count: ticket_count,
            password: password,
          }
        );
        await connection.commit();
        console.log("update成功....");
        return result; // 異動資料成功，返回 true
      } else {
        console.log("資料庫連接失敗");
      }
    } catch (e) {
      console.log(e);
    }
    // finally {
    //   if (this.connection) {
    //     try {
    //       await this.connection.close();
    //     } catch (e) {
    //       console.log(e);
    //     }
    //   }
    // }
  }
}

module.exports = new Database();
