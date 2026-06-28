import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';

const PROJECT_ID = 'voltaic-space-432417-e8';
const LOCATION = 'us-central1';
const MODEL = 'gemini-2.5-pro'; // or gemini-2.0-flash

async function testVertex() {
  const keyData = JSON.parse(readFileSync('google-vision-key.json', 'utf8'));
  const auth = new GoogleAuth({
    credentials: keyData,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",  // ✅ This is required
          parts: [{ text: 'Hello, are you working?' }]
        }
      ],
    }),
  });

  console.log('Status:', response.status);
  console.log('Response:', await response.text());
}

testVertex().catch(console.error);