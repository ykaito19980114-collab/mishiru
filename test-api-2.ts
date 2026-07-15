import axios from "axios";
async function run() {
  const r = await axios.get("http://localhost:3000/api/labs?univ=大阪大学");
  console.log(r.data.total);
}
run();
