async function search() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.error('Error: APIFY_API_TOKEN no esta configurado');
    process.exit(1);
  }
  const url = 'https://api.apify.com/v2/store/items?search=instagram%20likes&limit=5';

  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const text = await res.json();
    console.log(JSON.stringify(text, null, 2));
  } catch(e) {
    console.error(e);
  }
}
search();
