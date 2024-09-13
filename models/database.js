const oracledb = require("oracledb");

async function run() {
  let connection;

  try {
    // 建立連接
    connection = await oracledb.getConnection({
      user: "B2B", // 資料庫用戶名
      password: "b2b", // 資料庫密碼
      connectString: "10.1.1.15:1521/B2BDB", // 資料庫連接字串
    });

    console.log("成功連接至Oracle資料庫");

    // 執行SQL查詢
    const result = await connection.execute(
      // `UPDATE QRCODE_COM_FORM SET TICKET_REST = '9' WHERE NAME = 'ZENITRON'`
      `SELECT * FROM QRCODE_ACCOUNT`
      //   `INSERT INTO QRCODE_COM_FORM VALUES('ZEN-001', 'CharityNight', '20241010', 'ZENITRON', 'B', '10', '10')`
    );
    // await connection.commit(); //DML操作需要commit才會回寫資料庫

    console.log("資料已成功插入並提交", result);
  } catch (err) {
    console.error("出現錯誤:", err);
  } finally {
    if (connection) {
      try {
        // 關閉連接
        await connection.close();
        console.log("連接已關閉");
      } catch (err) {
        console.error("關閉連接時出現錯誤:", err);
      }
    }
  }
}

run();
