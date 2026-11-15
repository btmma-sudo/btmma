// Generate locally. Do not commit, email, or paste the printed private key into chat.
import {generateKeyPairSync} from "node:crypto";
const {privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
console.log(JSON.stringify(privateKey.export({format:"jwk"})));
