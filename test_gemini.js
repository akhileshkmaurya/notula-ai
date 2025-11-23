const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testModel(modelName) {
    console.log(`\nTesting model: ${modelName}...`);
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("❌ No API Key found in .env");
            return;
        }
        console.log(`API Key: ${apiKey.substring(0, 4)}...`);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent("Hello, can you hear me?");
        const response = await result.response;
        const text = response.text();

        console.log(`✅ Success with ${modelName}!`);
        console.log("Response:", text);
    } catch (error) {
        console.error(`❌ Failed with ${modelName}:`);
        console.error(error.message);
    }
}

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    // For listing models, we use the model manager if available, or just try to infer.
    // Actually, the SDK doesn't have a direct listModels method on the top level easily exposed in all versions.
    // Let's try to just test a few known variants.

    const variants = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-001',
        'gemini-1.0-pro',
        'gemini-pro'
    ];

    for (const model of variants) {
        await testModel(model);
    }
}

async function main() {
    await testModel('gemini-2.0-flash');
    await testModel('gemini-flash-latest');
}

main();
