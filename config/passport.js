let JwtStrategy = require("passport-jwt").Strategy;
let ExtractJwt = require("passport-jwt").ExtractJwt; //將製作出的jwt token擷取出來
const passport = require("passport");
const User = require("../models/").user;

module.exports = (passport) => {
  let opts = {};
  opts.jwtFromRequest = ExtractJwt.fromAuthHeaderWithScheme("jwt");
  opts.secretOrKey = process.env.PASSPORT_SECRET;

  passport.use(
    new JwtStrategy(opts, async function (jwt_payloag, done) {
      //jwt_payloag會取回先前在auth.js簽名過的tokenObject
      try {
        let result = await User.find({ password: jwt_payloag._id });
        if (result) {
          return done(null, result); //將req.user指向foundUser
        } else {
          return done(null, false);
        }
      } catch (e) {
        console.log("22222");
        return done(e, false);
      }
    })
  );
};
