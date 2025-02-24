import { useState } from "react";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Input";
import * as pdfjs from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry";
import "./FlashcardGenerator.css";

export default function FlashcardGenerator() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // New state to detect lecture slides
  const [isLectureSlides, setIsLectureSlides] = useState(false);

  // Function to extract text from PDF
  const extractTextFromPDF = async (file) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async (event) => {
      try {
        const typedArray = new Uint8Array(event.target.result);
        const pdf = await pdfjs.getDocument(typedArray).promise;
        let extractedText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          extractedText += pageText + "\n";
        }

        setText(extractedText);
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
        alert("Failed to process PDF file.");
      }
    };
  };

  // Handle file upload (Drag & Drop or Input)
  const handleFileUpload = (uploadedFile) => {
    if (!uploadedFile) return;

    setFile(uploadedFile);

    // Check if file name suggests lecture slides
    const fileName = uploadedFile.name.toLowerCase();
    const detectedLectureSlides = fileName.includes("lecture") || fileName.includes("slides");
    setIsLectureSlides(detectedLectureSlides);

    const fileType = uploadedFile.type;

    if (fileType === "application/pdf") {
      extractTextFromPDF(uploadedFile);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setText(e.target.result);
      reader.readAsText(uploadedFile);
    }
  };

  // Handle file input change
  const handleFileInputChange = (event) => {
    handleFileUpload(event.target.files[0]);
  };

  // Drag & Drop Handlers
  const handleDragOver = (event) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
  
    // Check if files were dropped
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFileUpload(event.dataTransfer.files[0]);
      event.dataTransfer.clearData();
    } else {
      // If no files, try to handle a text link
      const link = event.dataTransfer.getData("text/plain");
      if (link.startsWith("http")) {
        setText(link); // Store the dragged link
      } else {
        alert("Please drag a valid file or link.");
      }
    }
  };
  

  const fetchTextFromURL = async (url) => {
    try {
      if (!url.startsWith("http")) {
        alert("Invalid URL. Please provide a valid link.");
        return;
      }

      // Block known restricted domains
      const blockedDomains = ["mail.google.com", "drive.google.com", "dropbox.com"];
      const urlObject = new URL(url);
      if (blockedDomains.some((domain) => urlObject.hostname.includes(domain))) {
        alert("Fetching from this link is not allowed. Please download the file manually and upload it.");
        return;
      }

      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error("Failed to fetch the URL content.");

      const contentType = response.headers.get("Content-Type");

      if (contentType.includes("text/plain")) {
        const text = await response.text();
        setText(text);
      } else if (contentType.includes("text/html")) {
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");
        const extractedText = doc.body.innerText;
        setText(extractedText);
      } else {
        alert("Unsupported file type. Please provide a valid text-based link.");
      }
    } catch (error) {
      console.error("Error fetching URL:", error);
      alert("Could not load content from the provided link. Try pasting text manually.");
    }
  };

  // OpenAI API Request to Generate Flashcards
  const generateFlashcards = async () => {
    if (!text.trim()) {
      alert("Please upload a valid file before generating flashcards.");
      return;
    }
    setLoading(true);

    try {
      const maxTokens = 3000;
      const trimmedText = text.length > maxTokens ? text.substring(0, maxTokens) : text;

      // Adjust the system prompt based on lecture slides detection
      const systemPrompt = isLectureSlides
        ? "You are an AI that extracts key points from lecture slides and formats them as flashcards. Respond ONLY with valid JSON, structured as a list of objects, without markdown formatting."
        : "You are an AI that extracts key points and formats them as flashcards. Respond ONLY with valid JSON, structured as a list of objects, without markdown formatting.";

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: `Extract key points from the following text and convert them into question-answer flashcards. Try to make a flashcard per a keypoint.
              - Format the response as a **pure JSON array**.
              - Do **NOT** include any markdown, code blocks, or additional text.
              - The format MUST be: [{"question": "...", "answer": "..."}].
              - If the text is unclear, generate reasonable flashcards based on the content.
              
              Here is the text:\n\n${trimmedText}`
            }
          ],
          max_tokens: 700,
        }),
      });

      const data = await response.json();

      if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
        throw new Error("Unexpected API response structure.");
      }

      let aiResponse = data.choices[0].message.content.trim();

      // Remove unwanted markdown formatting (```json and ```)
      aiResponse = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();

      try {
        const parsedFlashcards = JSON.parse(aiResponse);
        setFlashcards(parsedFlashcards);
        setCurrentIndex(0);
      } catch (error) {
        console.error("Error parsing AI response:", error);
        alert("Failed to parse AI-generated flashcards. AI response was:\n" + aiResponse);
      }
    } catch (error) {
      console.error("Error generating flashcards:", error);
      alert("Failed to generate flashcards. Please check your OpenAI API key.");
    }

    setLoading(false);
  };

  // Flashcard Navigation & Flip
  const toggleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? flashcards.length - 1 : prevIndex - 1));
  };

  const nextCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prevIndex) => (prevIndex === flashcards.length - 1 ? 0 : prevIndex + 1));
  };

  return (
    <div className="flashcard-container">
      <h1 className="title">Flashcard Generator</h1>

      {/* Drag & Drop File Upload */}
      <div 
        className={`drop-zone ${dragActive ? "active" : ""}`} 
        onDragOver={handleDragOver} 
        onDragLeave={handleDragLeave} 
        onDrop={handleDrop}
      >
        <Input type="file" accept=".txt,.md,.csv,.docx,.pdf" onChange={handleFileInputChange} className="file-input" />
      </div>

      {file && <p className="file-name">Selected File: {file.name}</p>}

      <Button className="generate-button" onClick={generateFlashcards} disabled={loading}>
        {loading ? "Generating..." : "Generate Flashcards"}
      </Button>

      {flashcards.length > 0 && (
        <div className="flashcard-ui">
          {/* Flashcard Display with flip effect */}
          <div className={`flashcard ${isFlipped ? "flipped" : ""}`} onClick={toggleFlip}>
            <div className="flashcard-face flashcard-front">
              {flashcards[currentIndex].question}
            </div>
            <div className="flashcard-face flashcard-back">
              {flashcards[currentIndex].answer}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flashcard-nav">
            <button className="nav-button left" onClick={prevCard}>←</button>
            <button className="flashcard-count-btn" disabled>
              {currentIndex + 1}/{flashcards.length}
            </button>
            <button className="nav-button right" onClick={nextCard}>→</button>
          </div>
        </div>
      )}
    </div>
  );
}
