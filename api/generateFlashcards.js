// api/generateFlashcards.js
export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    const { text, isLectureSlides } = req.body;
  
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
  
    try {
      const maxTokens = 3000;
      const trimmedText = text.length > maxTokens ? text.substring(0, maxTokens) : text;
  
      const systemPrompt = isLectureSlides
        ? "You are an AI that extracts key points from lecture slides and formats them as flashcards. Respond ONLY with valid JSON, structured as a list of objects, without markdown formatting."
        : "You are an AI that extracts key points and formats them as flashcards. Respond ONLY with valid JSON, structured as a list of objects, without markdown formatting.";
  
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Use your secure API key stored as an environment variable
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Extract key points from the following text and convert them into question-answer flashcards. Here is the text:\n\n${trimmedText}` },
          ],
          max_tokens: 700,
        }),
      });
  
      const data = await response.json();
  
      if (!data.choices || data.choices.length === 0) {
        throw new Error("Unexpected API response structure.");
      }
  
      // Forward the API response back to the client
      res.status(200).json(data);
    } catch (error) {
      console.error("Error generating flashcards:", error);
      res.status(500).json({ error: error.toString() });
    }
  }
  