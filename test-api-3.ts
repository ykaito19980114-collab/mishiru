import axios from "axios";
async function run() {
  const r = await axios.get("http://localhost:3000/api/labs?tag=情報");
  console.log(r.data.total);
}
run();
