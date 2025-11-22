const OpenAI = require('openai');

const GEMINI_API_KEY = 'AIzaSyDzG5xxuanbABpqBosjRoA0M7yzEzPW3ZA';

async function testGemini() {
    console.log('Testing Gemini API...');

    // Try 1: Standard v1beta/openai/
    try {
        console.log('\n--- Attempt 1: v1beta/openai/ ---');
        const client = new OpenAI({
            apiKey: GEMINI_API_KEY,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
        });

        const response = await client.chat.completions.create({
            model: 'gemini-flash-latest',
            messages: [{ role: 'user', content: 'Hello, are you working?' }],
        });
        console.log('Success:', response.choices[0].message.content);
        return;
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) console.error('Status:', error.response.status);
    }

    // Try 2: No trailing slash
    try {
        console.log('\n--- Attempt 2: v1beta/openai ---');
        const client = new OpenAI({
            apiKey: GEMINI_API_KEY,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai'
        });

        const response = await client.chat.completions.create({
            model: 'gemini-flash-latest',
            messages: [{ role: 'user', content: 'Hello, are you working?' }],
        });
        console.log('Success:', response.choices[0].message.content);
        return;
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testGemini();
