import type { Definition } from '../types';

export async function lookupWord(word: string): Promise<Definition | null> {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    
    const entry = data[0];
    const firstMeaning = entry.meanings?.[0];
    
    if (!firstMeaning) {
      return null;
    }
    
    const firstDefinition = firstMeaning.definitions?.[0];
    
    if (!firstDefinition) {
      return null;
    }
    
    // Abbreviate part of speech
    const abbreviations: Record<string, string> = {
      'noun': 'n',
      'verb': 'v',
      'adjective': 'adj',
      'adverb': 'adv',
      'preposition': 'prep',
      'conjunction': 'conj',
      'interjection': 'interj',
      'pronoun': 'pron',
    };
    
    return {
      word: entry.word,
      partOfSpeech: abbreviations[firstMeaning.partOfSpeech] || firstMeaning.partOfSpeech,
      definition: firstDefinition.definition,
    };
  } catch {
    return null;
  }
}
