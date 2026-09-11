import os
from transformers import pipeline
from openai import OpenAI

# Initialize local models for fast, zero-shot classification and semantic similarity
# Using a lightweight model for demo/development
# In production, we'd load this once in the worker startup
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")

# Initialize OpenAI client for complex reasoning (requires OPENAI_API_KEY env var)
# Used as a fallback or for complex clause decomposition
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", "mock-key-for-now"))

class NLPExtractor:
    def __init__(self):
        pass

    def classify_clause(self, text: str) -> str:
        """Classify a tender clause into predefined categories using Transformers."""
        candidate_labels = ['financial eligibility', 'technical capability', 'regulatory compliance', 'general terms']
        result = classifier(text, candidate_labels)
        return result['labels'][0]

    def extract_rules_llm(self, text: str) -> list:
        """Use OpenAI LLM to decompose a complex clause into discrete, deterministic rules."""
        if client.api_key == "mock-key-for-now":
            print("Warning: OPENAI_API_KEY not set. Using fallback mock extraction.")
            return [{"metric": "turnover", "operator": "GTE", "value": 10.0}]

        try:
            response = client.chat.completions.create(
                model="gpt-4-turbo",
                messages=[
                    {"role": "system", "content": "Extract executable compliance rules from the tender text. Output JSON array."},
                    {"role": "user", "content": text}
                ],
                response_format={ "type": "json_object" }
            )
            # Process response...
            return response.choices[0].message.content
        except Exception as e:
            print(f"LLM Extraction failed: {e}")
            return []

    def verify_consistency(self, text_a: str, text_b: str) -> bool:
        """Use semantic similarity to check if two extracted values mean the same thing (e.g., entity names)."""
        # Example implementation using a simple similarity metric or transformer
        # For production, we'd use sentence-transformers to calculate cosine similarity
        return text_a.lower() in text_b.lower() or text_b.lower() in text_a.lower()

if __name__ == "__main__":
    extractor = NLPExtractor()
    print("Classified:", extractor.classify_clause("The bidder must have a minimum average turnover of Rs 10 Crore."))
