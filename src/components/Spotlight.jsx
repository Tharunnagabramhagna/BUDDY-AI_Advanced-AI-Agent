import { Mic, Send, Sparkles, ChevronDown, X, Settings, Menu, Plus, MessageSquare } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import CommandInput from './CommandInput';
import { addMessage, addMessages, getHistory, setHistory } from '../store/chatStore';

const APP_KEYWORDS = [
    'chrome', 'vscode', 'vs code', 'visual studio code', 'code',
    'notepad', 'paint', 'edge', 'spotify',
    'explorer', 'file explorer', 'terminal', 'cmd', 'powershell',
    'word', 'excel', 'powerpoint', 'outlook', 'teams', 'discord',
    'steam', 'vlc', 'zoom', 'slack', 'notion', 'obsidian', 'brave',
    'firefox', 'opera', 'photoshop', 'premiere', 'illustrator',
    'zomato', 'swiggy', 'amazon', 'flipkart', 'uber', 'ola', 'bookmyshow'
];

const COMMAND_TRIGGERS = ['open ', 'launch ', 'start ', 'run ', 'search ', 'order ', 'buy ', 'book ', 'search google for ', 'search youtube for '];
const SIDEBAR_SUGGESTIONS = ['Ask me anything', 'Open Chrome', 'Search YouTube', 'Search Google'];

const LOCAL_RESPONSES = {
    greetings: {
        triggers: ['hi', 'hello', 'hey', 'hiya', 'howdy', 'sup', 'what\'s up', 'whats up', 'yo'],
        responses: [
            "Hey there! 👋 What can I help you with?",
            "Hello! Great to see you. What's on your mind?",
            "Hey! I'm here and ready. What do you need?",
            "Hi! Ask me anything or tell me to open an app 😊",
            "Hey! What's good? How can I help? 😄",
            "Yo! Ready when you are. What do you need?",
            "Hello there! What are we working on today?",
        ]
    },
    farewells: {
        triggers: ['see you', 'see ya', 'later', 'good night', 'goodnight', 'cya', 'take care', 'farewell'],
        responses: [
            "Goodbye! Press Ctrl+Alt+B whenever you need me 👋",
            "See you later! I'll be right here when you need me.",
            "Take care! Come back anytime 😊",
            "Bye! Just press Ctrl+Alt+B to wake me up again.",
            "Later! You know where to find me 🚀",
            "Peace out! Ctrl+Alt+B brings me back anytime.",
            "Catch you on the flip side! 👋",
        ]
    },
    thanks: {
        triggers: ['thank you', 'thanks', 'thx', 'ty', 'thank u', 'many thanks', 'appreciate it', 'appreciated'],
        responses: [
            "You're welcome! Anything else I can help with? 😊",
            "Happy to help! What's next?",
            "Anytime! That's what I'm here for.",
            "Glad I could help! Let me know if you need anything else.",
            "No problem at all! Need anything else?",
            "Always happy to help! What's next?",
            "That's what I'm here for! 🚀",
        ]
    },
    howAreYou: {
        triggers: ['how are you', 'how r you', 'how are u', 'you ok', 'you good', 'hows it going', 'how\'s it going', 'how do you do'],
        responses: [
            "I'm doing great, thanks for asking! 🚀 How about you?",
            "Running at full power and ready to help! What do you need?",
            "Always good when there's someone to help! What's up?",
            "Fantastic! Better now that you're here. What can I do for you?",
            "Never been better! What can I do for you?",
            "All systems go! What do you need?",
        ]
    },
    compliments: {
        triggers: ['you\'re great', 'your great', 'you are great', 'good job', 'well done', 'amazing', 'awesome', 'you\'re awesome', 'you\'re the best', 'love you', 'great job', 'nice work', 'you\'re smart', 'you\'re cool'],
        responses: [
            "Aww, thank you! That means a lot 😊 What else can I do for you?",
            "You're making me blush! 😄 How can I help?",
            "Thanks! I try my best. What do you need next?",
            "That's so kind! I'm here to serve 🚀",
            "You're too kind! 😄 What can I do for you?",
            "Appreciate it! Now, how can I help?",
        ]
    },
    whoAreYou: {
        triggers: ['who are you', 'what are you', 'what can you do', 'what do you do', 'tell me about yourself', 'introduce yourself', 'your name', 'what is buddy', 'what\'s buddy'],
        responses: [
            "I'm Buddy — your personal desktop AI assistant! 🤖\n\nI can:\n• Answer your questions\n• Open apps (Chrome, VS Code, etc.)\n• Search Google & YouTube\n• Have a conversation\n\nWhat would you like to do?",
            "Hey, I'm Buddy! ✨ Think of me as your always-on desktop assistant.\n\nJust tell me what you need — open apps, search the web, or just chat!",
            "I'm Buddy! 🤖 Your personal desktop sidekick.\n\nTell me to open apps, search the web, or just chat — I'm here for all of it!",
        ]
    },
    ok: {
        triggers: ['ok', 'okay', 'ok buddy', 'ok', 'got it', 'alright', 'sure', 'cool'],
        responses: [
            "👍 Let me know if you need anything!",
            "Sounds good! I'm here if you need me.",
            "Perfect! What's next?",
            "Roger that! Anything else?",
        ]
    },
    good: {
        triggers: ['good', 'good morning', 'good evening', 'good afternoon', 'morning', 'evening'],
        responses: [
            "Good morning! Ready to have a productive day? ☀️",
            "Hey! Hope your day is going great 😊",
            "Good to see you! What are we doing today?",
            "Hey! Always a good time when you're here 🚀",
        ]
    },
    testing: {
        triggers: ['test', 'testing', 'are you there', 'you there', 'hello?', 'anyone there', 'ping'],
        responses: [
            "Yep, I'm here! 👋 Loud and clear.",
            "Online and ready! What do you need?",
            "Present! What's up?",
            "Right here! Fire away 🚀",
        ]
    },
    laugh: {
        triggers: ['haha', 'hehe', 'lol', 'lmao', '😂', 'funny', 'hilarious', 'ha'],
        responses: [
            "Haha glad I could make you laugh 😄",
            "😄 Always here for a good time!",
            "Lol! What else can I do for you?",
            "Ha! That's what I'm here for 😄",
        ]
    },
    currentTime: {
        triggers: ["what's the time", "what is the time", "current time", "time now", "what time is it", "tell me the time", "the time"],
        responses: ['DYNAMIC_TIME']
    },
    currentDate: {
        triggers: ["what's today's date", "what is today's date", "today's date", "current date", "what date is it", "today date", "what day is today", "what's the date"],
        responses: ['DYNAMIC_DATE']
    },
    currentDay: {
        triggers: ["what day is it", "which day is today", "what's today", "today is", "what day today"],
        responses: ['DYNAMIC_DAY']
    },
    calendarFacts: {
        triggers: ["days in a week", "how many days in a week", "days in week", "how many days a week"],
        responses: ["There are 7 days in a week 📅\nMonday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday."]
    },
    monthsInYear: {
        triggers: ["how many months", "months in a year", "how many months in a year"],
        responses: ["There are 12 months in a year 📅\nJan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec."]
    },
    daysInYear: {
        triggers: ["how many days in a year", "days in a year"],
        responses: ["A regular year has 365 days 📅 A leap year has 366 days. Leap years happen every 4 years!"]
    },
    weeksInYear: {
        triggers: ["how many weeks in a year", "weeks in a year"],
        responses: ["There are 52 weeks in a year (plus 1 or 2 extra days) 📅"]
    },
    leapYear: {
        triggers: ["what is a leap year", "leap year", "when is leap year", "next leap year"],
        responses: ["A leap year has 366 days instead of 365 🗓️ It happens every 4 years. The next leap year is 2028!"]
    },
    worldCapital: {
        triggers: ["capital of india", "india capital"],
        responses: ["The capital of India is New Delhi 🇮🇳"]
    },
    usCapital: {
        triggers: ["capital of usa", "capital of america", "usa capital", "us capital", "capital of united states"],
        responses: ["The capital of the USA is Washington, D.C. 🇺🇸"]
    },
    ukCapital: {
        triggers: ["capital of uk", "capital of england", "uk capital", "capital of britain"],
        responses: ["The capital of the UK is London 🇬🇧"]
    },
    worldLargestCountry: {
        triggers: ["largest country", "biggest country", "largest country in the world"],
        responses: ["Russia is the largest country in the world 🌍 It covers about 17.1 million square kilometers!"]
    },
    worldSmallestCountry: {
        triggers: ["smallest country", "smallest country in the world"],
        responses: ["Vatican City is the smallest country in the world 🌍 It's only about 0.44 square kilometers!"]
    },
    worldPopulation: {
        triggers: ["world population", "how many people in the world", "population of the world", "world's population"],
        responses: ["The world population is approximately 8.1 billion people 🌍 and growing every second!"]
    },
    indiaPopulation: {
        triggers: ["population of india", "india population", "how many people in india"],
        responses: ["India's population is approximately 1.44 billion people 🇮🇳 making it the most populous country in the world!"]
    },
    continents: {
        triggers: ["how many continents", "list of continents", "continents in the world", "name the continents"],
        responses: ["There are 7 continents 🌍\n1. Asia\n2. Africa\n3. North America\n4. South America\n5. Antarctica\n6. Europe\n7. Australia (Oceania)"]
    },
    oceans: {
        triggers: ["how many oceans", "list of oceans", "name the oceans", "oceans in the world"],
        responses: ["There are 5 oceans 🌊\n1. Pacific Ocean (largest)\n2. Atlantic Ocean\n3. Indian Ocean\n4. Southern Ocean\n5. Arctic Ocean"]
    },
    ww2: {
        triggers: ["when was world war 2", "when did world war 2 start", "world war 2", "ww2", "second world war"],
        responses: ["World War 2 started on September 1, 1939 and ended on September 2, 1945 ⚔️\nIt involved most of the world's nations and was the deadliest conflict in human history."]
    },
    ww1: {
        triggers: ["when was world war 1", "world war 1", "ww1", "first world war"],
        responses: ["World War 1 started on July 28, 1914 and ended on November 11, 1918 ⚔️\nIt was one of the deadliest conflicts in history involving major world powers."]
    },
    moonLanding: {
        triggers: ["moon landing", "first moon landing", "when did humans land on moon", "neil armstrong moon"],
        responses: ["The first Moon landing was on July 20, 1969 🌕\nNeil Armstrong became the first human to walk on the Moon during NASA's Apollo 11 mission."]
    },
    independenceIndia: {
        triggers: ["india independence", "when did india get independence", "india independence day", "indian independence"],
        responses: ["India gained independence on August 15, 1947 🇮🇳\nIt marks the end of British rule and is celebrated every year as Independence Day!"]
    },
    internetInvention: {
        triggers: ["when was internet invented", "who invented internet", "history of internet", "internet invention"],
        responses: ["The Internet was invented in 1969 as ARPANET 🌐\nTim Berners-Lee created the World Wide Web in 1989, making it accessible to everyone!"]
    },
    firstComputer: {
        triggers: ["first computer", "who invented computer", "when was computer invented", "history of computer"],
        responses: ["The first electronic computer, ENIAC, was built in 1945 💻\nCharles Babbage is considered the 'father of the computer' for his mechanical designs in the 1800s."]
    },
    speedOfLight: {
        triggers: ["speed of light", "how fast is light", "light speed"],
        responses: ["The speed of light is approximately 299,792,458 meters per second ⚡\nThat's about 186,282 miles per second — fast enough to circle Earth 7.5 times in one second!"]
    },
    planetsInSolarSystem: {
        triggers: ["how many planets", "planets in solar system", "list of planets", "name the planets"],
        responses: ["There are 8 planets in our solar system 🪐\n1. Mercury\n2. Venus\n3. Earth\n4. Mars\n5. Jupiter\n6. Saturn\n7. Uranus\n8. Neptune"]
    },
    sunDistance: {
        triggers: ["distance from earth to sun", "how far is the sun", "earth to sun distance", "sun distance"],
        responses: ["The average distance from Earth to the Sun is about 150 million kilometers (93 million miles) ☀️\nLight from the Sun takes about 8 minutes to reach Earth!"]
    },

    // Political Leaders
    pmIndia: {
        triggers: ["who is the pm of india", "prime minister of india", "india pm", "pm of india", "who is india's prime minister", "current pm of india"],
        responses: ["The Prime Minister of India is Narendra Modi 🇮🇳\nHe has been serving as PM since May 2014 and leads the BJP party."]
    },
    presidentIndia: {
        triggers: ["president of india", "who is the president of india", "india president", "current president of india"],
        responses: ["The President of India is Droupadi Murmu 🇮🇳\nShe became the 15th President of India on July 25, 2022."]
    },
    presidentUSA: {
        triggers: ["president of usa", "us president", "president of america", "who is the president", "current us president", "president of united states"],
        responses: ["The President of the United States is Donald Trump 🇺🇸\nHe is serving his second term as the 47th President of the United States."]
    },
    pmUK: {
        triggers: ["prime minister of uk", "uk pm", "pm of uk", "who is uk prime minister", "british prime minister"],
        responses: ["The Prime Minister of the United Kingdom is Keir Starmer 🇬🇧\nHe became PM in July 2024 as leader of the Labour Party."]
    },
    presidentRussia: {
        triggers: ["president of russia", "russia president", "who is putin", "russian president"],
        responses: ["The President of Russia is Vladimir Putin 🇷🇺\nHe has been the dominant political figure in Russia since 2000."]
    },
    presidentChina: {
        triggers: ["president of china", "china president", "who leads china", "chinese president"],
        responses: ["The President of China is Xi Jinping 🇨🇳\nHe has been General Secretary of the Communist Party since 2012."]
    },
    pmAustralia: {
        triggers: ["prime minister of australia", "australia pm", "pm of australia"],
        responses: ["The Prime Minister of Australia is Anthony Albanese 🇦🇺\nHe became PM in May 2022 leading the Australian Labor Party."]
    },
    pmCanada: {
        triggers: ["prime minister of canada", "canada pm", "pm of canada"],
        responses: ["The Prime Minister of Canada is Mark Carney 🇨🇦\nHe became PM in March 2025."]
    },

    // Political Parties
    bjp: {
        triggers: ["what is bjp", "bjp party", "about bjp"],
        responses: ["BJP (Bharatiya Janata Party) is India's ruling political party 🇮🇳\nFounded in 1980, it follows Hindu nationalist ideology and is currently led by PM Narendra Modi."]
    },
    congress: {
        triggers: ["what is congress", "congress party india", "inc party", "indian national congress"],
        responses: ["The Indian National Congress (INC) is one of India's oldest political parties 🇮🇳\nFounded in 1885, it led India's independence movement. Currently led by Mallikarjun Kharge."]
    },

    // Fruits
    appleFruit: {
        triggers: ["what is apple", "apple fruit", "benefits of apple", "apple benefits", "is apple healthy"],
        responses: ["🍎 Apple is one of the most popular fruits!\n\nBenefits:\n• Rich in fiber and Vitamin C\n• Supports heart health\n• Helps with digestion\n• Low in calories\n\n'An apple a day keeps the doctor away!' 😄"]
    },
    banana: {
        triggers: ["what is banana", "banana fruit", "benefits of banana", "banana benefits", "is banana healthy"],
        responses: ["🍌 Banana is a tropical fruit loved worldwide!\n\nBenefits:\n• Rich in potassium\n• Great energy source\n• Supports heart and digestive health\n• Natural mood booster (contains serotonin)"]
    },
    mango: {
        triggers: ["what is mango", "mango fruit", "benefits of mango", "mango benefits", "is mango healthy"],
        responses: ["🥭 Mango is the King of Fruits!\n\nBenefits:\n• Rich in Vitamin A and C\n• Boosts immunity\n• Good for skin and hair\n• High in antioxidants\n\nIndia is the world's largest producer of mangoes! 🇮🇳"]
    },
    orange: {
        triggers: ["what is orange", "orange fruit", "benefits of orange", "orange benefits"],
        responses: ["🍊 Orange is a citrus fruit packed with nutrients!\n\nBenefits:\n• Very high in Vitamin C\n• Boosts immunity\n• Good for skin health\n• Helps lower cholesterol"]
    },
    grapes: {
        triggers: ["what is grapes", "grapes fruit", "benefits of grapes", "grapes benefits"],
        responses: ["🍇 Grapes are small but mighty!\n\nBenefits:\n• Rich in antioxidants\n• Supports heart health\n• Contains resveratrol (anti-aging)\n• Good for eyes and brain health"]
    },
    strawberry: {
        triggers: ["what is strawberry", "strawberry fruit", "benefits of strawberry"],
        responses: ["🍓 Strawberry is a delicious and nutritious fruit!\n\nBenefits:\n• High in Vitamin C\n• Rich in antioxidants\n• Supports heart health\n• Low in calories, great for weight management"]
    },
    watermelon: {
        triggers: ["what is watermelon", "watermelon fruit", "benefits of watermelon"],
        responses: ["🍉 Watermelon is the perfect summer fruit!\n\nBenefits:\n• 92% water — great for hydration\n• Rich in Vitamin A and C\n• Contains lycopene (antioxidant)\n• Natural electrolytes"]
    },

    // Vegetables
    tomato: {
        triggers: ["what is tomato", "tomato vegetable", "benefits of tomato", "tomato benefits", "is tomato a fruit or vegetable"],
        responses: ["🍅 Tomato — technically a fruit but used as a vegetable!\n\nBenefits:\n• Rich in lycopene (powerful antioxidant)\n• High in Vitamin C and K\n• Supports heart health\n• Good for skin"]
    },
    potato: {
        triggers: ["what is potato", "potato vegetable", "benefits of potato", "potato benefits"],
        responses: ["🥔 Potato is one of the world's most important food crops!\n\nBenefits:\n• Good source of Vitamin B6 and C\n• High in potassium\n• Rich in fiber\n• Great energy source"]
    },
    carrot: {
        triggers: ["what is carrot", "carrot vegetable", "benefits of carrot", "carrot benefits"],
        responses: ["🥕 Carrot is a root vegetable packed with nutrients!\n\nBenefits:\n• Very high in beta-carotene (Vitamin A)\n• Excellent for eyesight\n• Boosts immunity\n• Good for skin and teeth"]
    },
    spinach: {
        triggers: ["what is spinach", "spinach vegetable", "benefits of spinach", "spinach benefits"],
        responses: ["🥬 Spinach is a superfood green vegetable!\n\nBenefits:\n• Very high in iron\n• Rich in Vitamin K, A, and C\n• Supports bone health\n• Great for muscle strength (just like Popeye! 💪)"]
    },
    onion: {
        triggers: ["what is onion", "onion vegetable", "benefits of onion", "onion benefits"],
        responses: ["🧅 Onion is one of the most used vegetables in cooking!\n\nBenefits:\n• Rich in antioxidants\n• Anti-inflammatory properties\n• Supports heart health\n• Boosts immunity"]
    },
    garlic: {
        triggers: ["what is garlic", "garlic vegetable", "benefits of garlic", "garlic benefits"],
        responses: ["🧄 Garlic is a powerful medicinal food!\n\nBenefits:\n• Boosts immunity strongly\n• Reduces blood pressure\n• Antibacterial and antiviral\n• Rich in Vitamin C and B6\n\nUsed in medicine for thousands of years!"]
    },
    broccoli: {
        triggers: ["what is broccoli", "broccoli vegetable", "benefits of broccoli", "broccoli benefits"],
        responses: ["🥦 Broccoli is one of the healthiest vegetables!\n\nBenefits:\n• Very high in Vitamin C and K\n• Rich in fiber\n• Contains cancer-fighting compounds\n• Great for bone and heart health"]
    },

    // General food facts
    healthiestFruit: {
        triggers: ["healthiest fruit", "most healthy fruit", "best fruit to eat", "which fruit is healthiest"],
        responses: ["Top 5 healthiest fruits 🏆\n1. 🫐 Blueberries — highest in antioxidants\n2. 🍎 Apple — great for digestion\n3. 🍌 Banana — best energy source\n4. 🥭 Mango — richest in vitamins\n5. 🍊 Orange — highest in Vitamin C"]
    },
    healthiestVegetable: {
        triggers: ["healthiest vegetable", "most healthy vegetable", "best vegetable to eat", "which vegetable is healthiest"],
        responses: ["Top 5 healthiest vegetables 🏆\n1. 🥬 Spinach — highest in iron\n2. 🥦 Broccoli — cancer fighting\n3. 🥕 Carrot — best for eyesight\n4. 🧄 Garlic — strongest immunity booster\n5. 🍅 Tomato — rich in lycopene"]
    },
    calculatorHelp: {
        triggers: ["calculator", "can you calculate", "do math", "solve math", "math help", "calculate something"],
        responses: ["Sure! I can do math for you 🧮\n\nTry:\n• Basic: 2 + 2, 100 / 5, 3 * 4\n• Powers: 2 ^ 10\n• Percentage: 20% of 500\n• Trig: sin 30, cos 45, tan 60\n• Roots: sqrt 144\n• Logs: log 100, ln 10\n\nJust type the expression!"]
    },

    // Common cold & fever
    coldFever: {
        triggers: ['i have a cold', 'i have fever', 'i have a fever', 'cold and fever', 'running fever', 'high temperature', 'i feel feverish', 'fever tips', 'cold tips', 'i have flu', 'flu tips'],
        responses: [
            "Sorry to hear that! 🤒 Here are some tips for cold & fever:\n\n• Drink plenty of warm water and fluids\n• Rest as much as possible\n• Take paracetamol for fever (consult doctor)\n• Have warm soups and ginger tea\n• Use steam inhalation for congestion\n• Keep yourself warm\n\n⚠️ If fever exceeds 103°F (39.4°C), see a doctor immediately!",
            "Take care! 🌡️ Cold & fever tips:\n\n• Stay hydrated — water, ORS, coconut water\n• Get plenty of sleep and rest\n• Eat light, easily digestible food\n• Honey + ginger + lemon in warm water helps\n• Avoid cold drinks and cold food\n\n⚠️ See a doctor if symptoms last more than 3 days!"
        ]
    },

    // Diet & nutrition
    dietTips: {
        triggers: ['diet tips', 'healthy diet', 'what should i eat', 'nutrition tips', 'healthy eating', 'balanced diet', 'healthy food tips', 'eating habits'],
        responses: [
            "Here are some healthy diet tips! 🥗\n\n• Eat more fruits and vegetables daily\n• Include protein in every meal (eggs, dal, chicken)\n• Avoid processed and junk food\n• Eat smaller portions 4-5 times a day\n• Don't skip breakfast — it's the most important meal\n• Reduce sugar and salt intake\n• Include healthy fats (nuts, avocado, olive oil)\n• Drink 8 glasses of water daily 💧"
        ]
    },
    weightLoss: {
        triggers: ['how to lose weight', 'weight loss tips', 'i want to lose weight', 'lose weight fast', 'fat loss tips'],
        responses: [
            "Here are effective weight loss tips! 💪\n\n• Create a calorie deficit (burn more than you eat)\n• Eat high protein, low carb meals\n• Exercise at least 30 mins daily\n• Drink water before meals\n• Avoid sugary drinks and alcohol\n• Get 7-8 hours of sleep (poor sleep = weight gain)\n• Don't skip meals — eat smart instead\n\n⚠️ Aim for 0.5-1 kg loss per week — slow and steady is healthiest!"
        ]
    },

    // Exercise & fitness
    exerciseTips: {
        triggers: ['exercise tips', 'fitness tips', 'how to stay fit', 'workout tips', 'daily exercise', 'i want to exercise', 'how to start exercising', 'beginner workout'],
        responses: [
            "Great decision to exercise! 💪 Here's how to start:\n\n• Begin with 20-30 mins of walking daily\n• Add bodyweight exercises: pushups, squats, planks\n• Stretch before and after workouts\n• Aim for 150 mins of moderate exercise per week\n• Stay consistent — results take 3-4 weeks to show\n• Mix cardio + strength training for best results\n• Rest 1-2 days per week for recovery\n\n🔥 Even 10 mins of daily movement is better than nothing!"
        ]
    },
    morningRoutine: {
        triggers: ['morning routine', 'healthy morning routine', 'morning habits', 'good morning habits'],
        responses: [
            "Here's a healthy morning routine! ☀️\n\n1. Wake up early (5-7 AM)\n2. Drink a glass of warm water\n3. 10-15 mins of stretching or yoga\n4. Light exercise or walk\n5. Healthy breakfast (eggs, oats, fruits)\n6. Plan your day for 5 mins\n\n💡 A good morning sets the tone for the whole day!"
        ]
    },

    // Sleep & rest
    sleepTips: {
        triggers: ['sleep tips', 'how to sleep better', 'i cant sleep', "can't sleep", 'insomnia tips', 'improve sleep', 'better sleep', 'sleep problems', 'sleeping issues'],
        responses: [
            "Here are tips for better sleep! 😴\n\n• Stick to a consistent sleep schedule\n• Avoid screens 30-60 mins before bed\n• Keep your room cool and dark\n• Avoid caffeine after 3 PM\n• Try deep breathing or meditation before sleep\n• Don't eat heavy meals right before bed\n• Exercise during the day (not late at night)\n\n💡 Adults need 7-9 hours of sleep per night!"
        ]
    },
    howMuchSleep: {
        triggers: ['how many hours of sleep', 'how much sleep do i need', 'how long should i sleep', 'ideal sleep duration'],
        responses: [
            "Recommended sleep by age 😴\n\n• Newborns: 14-17 hours\n• Toddlers: 11-14 hours\n• School kids: 9-11 hours\n• Teens: 8-10 hours\n• Adults: 7-9 hours\n• Seniors: 7-8 hours\n\n💡 Quality matters more than quantity — deep sleep is key!"
        ]
    },

    // Mental health
    stressTips: {
        triggers: ['i am stressed', 'stress tips', 'how to reduce stress', 'feeling stressed', 'anxiety tips', 'i have anxiety', 'feeling anxious', 'mental health tips', 'i feel overwhelmed'],
        responses: [
            "I hear you 💙 Here are tips to manage stress:\n\n• Take slow deep breaths (inhale 4s, hold 4s, exhale 4s)\n• Go for a short walk outside\n• Talk to someone you trust\n• Write down what's bothering you\n• Limit social media and news\n• Practice gratitude — list 3 good things daily\n• Take breaks and rest\n\n⚠️ If stress is affecting daily life, please speak to a mental health professional!",
            "You're not alone 💙 Managing stress:\n\n• 5-4-3-2-1 grounding: name 5 things you see, 4 you hear, 3 you can touch\n• Meditate for even 5 mins daily\n• Exercise releases stress-relieving endorphins\n• Get enough sleep\n• Avoid alcohol and smoking\n\n💡 It's okay to not be okay — reach out for help when needed!"
        ]
    },
    meditation: {
        triggers: ['how to meditate', 'meditation tips', 'meditation for beginners', 'how to start meditating'],
        responses: [
            "Here's how to start meditating! 🧘\n\n1. Find a quiet spot and sit comfortably\n2. Close your eyes and relax\n3. Focus on your breathing\n4. Inhale slowly for 4 counts\n5. Hold for 4 counts\n6. Exhale for 4 counts\n7. Repeat for 5-10 minutes\n\n💡 Start with just 5 mins a day — consistency is more important than duration!"
        ]
    },

    // Hydration
    waterIntake: {
        triggers: ['how much water should i drink', 'daily water intake', 'how many glasses of water', 'water intake tips', 'hydration tips', 'am i drinking enough water'],
        responses: [
            "Here's your hydration guide! 💧\n\n• Adults should drink 8-10 glasses (2-2.5 litres) daily\n• Drink a glass of water first thing in the morning\n• Drink water before every meal\n• Carry a water bottle everywhere\n• Eat water-rich foods: cucumber, watermelon, oranges\n• Your urine should be light yellow — dark means dehydrated!\n\n💡 Increase intake when exercising or in hot weather!"
        ]
    },
    dehydration: {
        triggers: ['signs of dehydration', 'am i dehydrated', 'dehydration symptoms', 'dehydration tips'],
        responses: [
            "Signs of dehydration to watch out for! 💧\n\n• Dark yellow urine\n• Dry mouth and lips\n• Headache or dizziness\n• Fatigue and low energy\n• Dry skin\n• Less frequent urination\n\n✅ Fix: Drink water immediately, have ORS if severe, eat hydrating fruits!\n\n⚠️ Severe dehydration needs medical attention!"
        ]
    },

    // Headache & body pain
    headacheTips: {
        triggers: ['i have a headache', 'headache tips', 'how to cure headache', 'headache remedy', 'headache relief', 'my head is hurting', 'head pain'],
        responses: [
            "Sorry about the headache! 🤕 Here are some remedies:\n\n• Drink a large glass of water (dehydration is a common cause)\n• Rest in a quiet, dark room\n• Apply a cold or warm compress on forehead\n• Gently massage your temples\n• Take a break from screens\n• Try peppermint oil on temples\n• Get some fresh air\n\n⚠️ If headache is severe or with fever/vomiting, see a doctor!"
        ]
    },
    backPain: {
        triggers: ['back pain', 'i have back pain', 'back pain tips', 'lower back pain', 'spine pain', 'back pain relief'],
        responses: [
            "Back pain relief tips! 🦴\n\n• Apply hot/cold pack to the affected area\n• Do gentle stretches and yoga\n• Avoid sitting for long periods — take breaks\n• Use a supportive chair with good posture\n• Sleep on a firm mattress\n• Strengthen core muscles with exercises\n• Avoid lifting heavy objects incorrectly\n\n⚠️ If pain is severe or radiates to legs, see a doctor!"
        ]
    },
    eyeStrain: {
        triggers: ['eye strain', 'eyes hurting', 'eye pain', 'tired eyes', 'screen time eyes', 'eye tips'],
        responses: [
            "Eye strain tips! 👁️\n\n• Follow 20-20-20 rule: every 20 mins, look 20 feet away for 20 seconds\n• Reduce screen brightness\n• Blink more frequently\n• Use artificial tears/eye drops if needed\n• Keep screen at arm's length\n• Avoid screens in the dark\n• Get regular eye checkups\n\n💡 Blue light glasses can help reduce digital eye strain!"
        ]
    },

    // Skin care
    skinCareTips: {
        triggers: ['skin care tips', 'healthy skin tips', 'how to get clear skin', 'skin tips', 'glowing skin tips', 'skin care routine'],
        responses: [
            "Here's your skin care guide! ✨\n\n• Drink plenty of water — hydration shows on skin\n• Wash face twice daily with gentle cleanser\n• Always moisturize after washing\n• Use SPF sunscreen daily (even indoors)\n• Remove makeup before sleeping\n• Eat antioxidant-rich foods (berries, green tea)\n• Get 7-8 hours of sleep\n• Avoid touching your face frequently\n\n💡 Consistency is key — results show in 4-6 weeks!"
        ]
    },
    acneTips: {
        triggers: ['acne tips', 'how to remove pimples', 'pimple tips', 'how to get rid of acne', 'acne remedies', 'pimple remedies'],
        responses: [
            "Acne tips that actually work! 🌿\n\n• Keep face clean — wash twice daily\n• Don't pop or squeeze pimples\n• Use salicylic acid or benzoyl peroxide products\n• Change pillowcases frequently\n• Drink more water and reduce sugar intake\n• Apply aloe vera gel on affected areas\n• Use non-comedogenic (non-pore-clogging) products\n\n⚠️ For severe acne, consult a dermatologist!"
        ]
    },

    // General health
    bmiInfo: {
        triggers: ['what is bmi', 'bmi tips', 'how to calculate bmi', 'bmi calculator', 'healthy bmi'],
        responses: [
            "BMI (Body Mass Index) explained! 📊\n\nFormula: BMI = weight(kg) / height(m)²\n\nBMI ranges:\n• Under 18.5 = Underweight\n• 18.5 - 24.9 = Normal weight ✅\n• 25 - 29.9 = Overweight\n• 30 and above = Obese\n\n💡 BMI is a general guide — consult a doctor for a complete health assessment!"
        ]
    },
    immunityTips: {
        triggers: ['how to boost immunity', 'immunity tips', 'boost immune system', 'weak immunity', 'strengthen immunity'],
        responses: [
            "Boost your immunity naturally! 🛡️\n\n• Eat citrus fruits (Vitamin C)\n• Add turmeric and ginger to your diet\n• Exercise regularly\n• Get enough sleep (7-8 hours)\n• Manage stress levels\n• Stay hydrated\n• Avoid smoking and excess alcohol\n• Take Vitamin D (sunlight exposure)\n\n💡 A healthy gut = strong immunity — eat probiotic foods like yogurt!"
        ]
    }
};

const extractAddress = (text) => {
    const lower = text.toLowerCase().trim();
    const addressWords = ['bro', 'macha', 'da', 'man', 'dude', 'buddy', 'mate', 'bud', 'homie', 'boss', 'chief', 'bhai', 'yaar', 'anna'];
    for (const word of addressWords) {
        // Must be a whole word — surrounded by spaces, punctuation, or at start/end
        const regex = new RegExp(`(^|\\s|,)${word}(\\s|,|!|\\?|$)`, 'i');
        if (regex.test(lower)) return word;
    }
    return null;
};

const injectAddress = (response, address) => {
    if (!address) return response;

    // Don't add address if response already contains it
    if (response.toLowerCase().includes(address.toLowerCase())) return response;

    // Add address naturally — at the end of the first sentence
    if (response.includes('!')) {
        // Replace first exclamation mark with ", {address}!"
        return response.replace('!', `, ${address}!`);
    }
    if (response.includes('?')) {
        return response.replace('?', `, ${address}?`);
    }
    // Add at end of first line
    const lines = response.split('\n');
    lines[0] = lines[0] + `, ${address}`;
    return lines.join('\n');
};

const getLocalResponse = (text, lastUsedResponsesRef) => {
    const lower = text.toLowerCase().trim();
    const address = extractAddress(lower);

    // Dynamic time and date responses
    const timeNow = new Date();
    const timeStr = timeNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = timeNow.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dayStr = timeNow.toLocaleDateString([], { weekday: 'long' });

    const dynamicMap = {
        currentTime: `The current time is ${timeStr} 🕐`,
        currentDate: `Today is ${dateStr} 📅`,
        currentDay: `Today is ${dayStr} 📅`,
    };

    for (const [key, category] of Object.entries(LOCAL_RESPONSES)) {
        const matched = category.triggers.some(t => {
            const tLower = t.toLowerCase();
            // Exact match
            if (lower === tLower || lower === tLower + '?' || lower === tLower + '!') return true;
            // Starts or ends with trigger as whole phrase
            if (lower.startsWith(tLower + ' ') || lower.startsWith(tLower + '?')) return true;
            if (lower.endsWith(' ' + tLower) || lower.endsWith(' ' + tLower + '?')) return true;
            // Contains trigger as whole word/phrase using word boundary
            const escaped = tLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|\\s)${escaped}(\\s|\\?|!|$)`);
            return regex.test(lower);
        });
        if (matched) {
            if (dynamicMap[key]) return injectAddress(dynamicMap[key], address);
            const responses = category.responses;
            const lastUsed = lastUsedResponsesRef.current[key];
            const available = responses.filter((_, i) => i !== lastUsed);
            const idx = Math.floor(Math.random() * available.length);
            const originalIdx = responses.indexOf(available[idx]);
            lastUsedResponsesRef.current[key] = originalIdx;
            return injectAddress(available[idx], address);
        }
    }
    return null;
};

const safeEval = (expr) => {
    // Tokenize and evaluate safely without eval or Function()
    const tokens = expr.match(/[\d.]+|[+\-*/()]/g);
    if (!tokens) return null;

    let pos = 0;

    const parseNumber = () => {
        const tok = tokens[pos];
        if (tok === undefined) return null;
        const num = parseFloat(tok);
        if (!isNaN(num)) { pos++; return num; }
        if (tok === '(') {
            pos++; // skip (
            const val = parseAddSub();
            pos++; // skip )
            return val;
        }
        return null;
    };

    const parseMulDiv = () => {
        let left = parseNumber();
        while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
            const op = tokens[pos++];
            const right = parseNumber();
            if (op === '*') left *= right;
            else left = left / right;
        }
        return left;
    };

    const parseAddSub = () => {
        let left = parseMulDiv();
        while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
            const op = tokens[pos++];
            const right = parseMulDiv();
            if (op === '+') left += right;
            else left -= right;
        }
        return left;
    };

    try {
        const result = parseAddSub();
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            return parseFloat(result.toFixed(6));
        }
    } catch { return null; }
    return null;
};

const evaluateMath = (text) => {
    const lower = text.toLowerCase().trim();

    // Trig functions
    const trigMap = {
        'sin': (x) => Math.sin(x * Math.PI / 180),
        'cos': (x) => Math.cos(x * Math.PI / 180),
        'tan': (x) => Math.tan(x * Math.PI / 180),
        'sqrt': (x) => Math.sqrt(x),
        'log': (x) => Math.log10(x),
        'ln': (x) => Math.log(x),
    };

    // Check for trig/math function patterns like "sin 30", "cos(45)", "sqrt 16"
    for (const [fn, calc] of Object.entries(trigMap)) {
        const trigRegex = new RegExp(`^${fn}\\s*\\(?([\\d.]+)\\)?$`);
        const match = lower.match(trigRegex);
        if (match) {
            const val = parseFloat(match[1]);
            const result = calc(val);
            return `${fn}(${val}) = ${parseFloat(result.toFixed(6))} 🧮`;
        }
    }

    // Check for percentage: "20% of 500", "15 percent of 200"
    const percentMatch = lower.match(/^([\d.]+)\s*(%|percent)\s*of\s*([\d.]+)$/);
    if (percentMatch) {
        const result = (parseFloat(percentMatch[1]) / 100) * parseFloat(percentMatch[3]);
        return `${percentMatch[1]}% of ${percentMatch[3]} = ${parseFloat(result.toFixed(4))} 🧮`;
    }

    // Check for power: "2 power 10", "2^10", "2**10"
    const powerMatch = lower.match(/^([\d.]+)\s*(power|\^|\*\*)\s*([\d.]+)$/);
    if (powerMatch) {
        const result = Math.pow(parseFloat(powerMatch[1]), parseFloat(powerMatch[3]));
        return `${powerMatch[1]} ^ ${powerMatch[3]} = ${result} 🧮`;
    }

    // Detect basic arithmetic expressions like "2 + 2", "100 / 5", "3 * 4", "10 - 3"
    // Also handle: "what is 2 + 2", "calculate 5 * 6", "solve 10 / 2"
    let expr = lower
        .replace(/^(what is|calculate|calc|solve|evaluate|compute)\s+/i, '')
        .replace(/x/g, '*')
        .replace(/divided by/g, '/')
        .replace(/multiplied by/g, '*')
        .replace(/times/g, '*')
        .replace(/plus/g, '+')
        .replace(/minus/g, '-')
        .trim();

    // CSP-safe recursive descent parser — no eval or Function()
    if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) {
        const result = safeEval(expr);
        if (result !== null) {
            return `${expr} = ${result} 🧮`;
        }
    }

    return null;
};

const glassCard = {
    background: 'rgba(18,18,22,0.65)',
    backdropFilter: 'blur(60px) saturate(200%)',
    WebkitBackdropFilter: 'blur(60px) saturate(200%)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)'
};

const BuddyLogo = React.memo(({ size = 'sm', pulse = true }) => {
    const dim = size === 'lg' ? 64 : size === 'md' ? 40 : 28;
    const iconSize = size === 'lg' ? 22 : size === 'md' ? 14 : 10;
    const ringDim = size === 'lg' ? 80 : size === 'md' ? 52 : 36;

    return (
        <div className="relative flex items-center justify-center" style={{ width: ringDim, height: ringDim }}>
            {pulse && (
                <>
                    <div className="absolute inset-0 rounded-full animate-ping" style={{ border: '1.5px solid rgba(99,102,241,0.4)', animationDuration: '2.4s' }} />
                    <div className="absolute inset-0 rounded-full animate-ping" style={{ border: '1.5px solid rgba(139,92,246,0.25)', animationDuration: '2.4s', animationDelay: '0.9s' }} />
                    <div className="absolute inset-0 rounded-full animate-ping" style={{ border: '1px solid rgba(59,130,246,0.15)', animationDuration: '2.4s', animationDelay: '1.6s' }} />
                </>
            )}
            <div
                className="relative rounded-full flex items-center justify-center"
                style={{
                    width: dim,
                    height: dim,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.3) 0%, rgba(99,102,241,0.25) 50%, rgba(139,92,246,0.2) 100%)',
                    border: '1px solid rgba(139,92,246,0.5)',
                    boxShadow: '0 0 30px rgba(99,102,241,0.3), 0 0 60px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.15)'
                }}
            >
                <Sparkles size={iconSize} style={{ color: 'rgba(167,139,250,1)' }} />
            </div>
        </div>
    );
});

const Sidebar = React.memo(({ visible }) => (
    <div
        className="fixed right-5 top-1/2 -translate-y-1/2 w-[180px]"
        style={{ transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)', opacity: visible ? 1 : 0, transform: `translateY(-50%) translateX(${visible ? 0 : 24}px)`, pointerEvents: visible ? 'auto' : 'none' }}
    >
        <div
            style={{
                background: 'rgba(12,12,18,0.82)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderTop: '0.5px solid rgba(99,102,241,0.3)',
                borderRadius: 18,
                padding: '16px',
                boxShadow: '0 24px 56px rgba(0,0,0,0.5), inset 0 1px 0 rgba(99,102,241,0.1)'
            }}
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 10px rgba(52,211,153,1)' }} />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500, letterSpacing: '0.04em' }}>ONLINE</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Hey, I&apos;m Buddy</p>
            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>Your personal AI assistant - always one shortcut away.</p>
            <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10, letterSpacing: '0.06em', marginBottom: 8 }}>TRY SAYING</p>
            {SIDEBAR_SUGGESTIONS.map((text) => (
                <div key={text} className="flex items-center gap-1.5 mb-1.5">
                    <span style={{ color: 'rgba(139,92,246,0.8)', fontSize: 10 }}>{'>'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 11 }}>{text}</span>
                </div>
            ))}
            <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' }}>qwen3.5:2b (Local)</p>
        </div>
    </div>
));

const WelcomeSplash = React.memo(({ onDone }) => {
    const [phase, setPhase] = useState('enter');
    useEffect(() => {
        const t1 = setTimeout(() => setPhase('hold'), 300);
        const t2 = setTimeout(() => setPhase('dissolve'), 2200);
        const t3 = setTimeout(() => onDone(), 2800);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, []);
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.96)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
            opacity: phase === 'dissolve' ? 0 : 1,
            transform: phase === 'dissolve' ? 'scale(0.98)' : 'scale(1)',
            pointerEvents: phase === 'dissolve' ? 'none' : 'auto'
        }}>
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                transition: 'opacity 0.5s ease, transform 0.5s ease',
                opacity: phase === 'enter' ? 0 : 1,
                transform: phase === 'enter' ? 'translateY(12px)' : 'translateY(0)'
            }}>
                <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(99,102,241,0.3)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(139,92,246,0.2)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.8s' }} />
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))',
                        border: '1px solid rgba(139,92,246,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 30px rgba(99,102,241,0.25)'
                    }}>
                        <Sparkles size={22} style={{ color: 'rgba(167,139,250,0.9)' }} />
                    </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ color: 'rgba(255,255,255,0.92)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>Buddy</h1>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 6, fontWeight: 400 }}>Your personal AI assistant</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 20px', borderRadius: 100, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Ready</span>
                    </div>
                    <div style={{ width: '0.5px', height: 12, background: 'rgba(255,255,255,0.1)' }} />
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'monospace' }}>Ctrl+Alt+B</span>
                </div>
            </div>
        </div>
    );
});

const ChatHeader = React.memo(({ onToggleSidebar }) => (
    <div
        className="relative w-full"
        style={{
            ...glassCard,
            borderRadius: '20px 20px 0 0',
            padding: '16px 20px 12px',
            borderBottom: '0.5px solid rgba(255,255,255,0.06)'
        }}
    >
        <div className="flex items-center px-5 py-3 pr-16 justify-between w-full">
            <div className="flex items-center gap-3">
                <button 
                    onClick={onToggleSidebar}
                    style={{
                        background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4,
                        transition: 'color 0.2s', zIndex: 110
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'white'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                >
                    <Menu size={16} />
                </button>
                <div className="flex items-center gap-2" style={{ color: 'rgba(96,165,250,0.9)', fontWeight: 500, letterSpacing: '0.08em', fontSize: 12 }}>
                    <Sparkles size={15} />
                    <span>BUDDY AI</span>
                </div>
            </div>
        </div>
    </div>
));

// Rebudget card — shown when no product falls within the original budget

const PaymentOptionsCard = React.memo(({ platform, onSelect, onCancel }) => {
    const [selected, setSelected] = useState(null);
    const [upiId, setUpiId] = useState('');

    const paymentMethods = [
        { id: 'cod', label: 'Cash on Delivery', emoji: '💵', desc: 'Pay when your order arrives' },
        { id: 'upi', label: 'UPI', emoji: '📱', desc: 'GPay, PhonePe, Paytm' },
        { id: 'card', label: 'Credit / Debit Card', emoji: '💳', desc: 'Visa, Mastercard, Rupay' },
        { id: 'netbanking', label: 'Net Banking', emoji: '🏦', desc: 'All major banks supported' },
        { id: 'amazonpay', label: 'Amazon Pay', emoji: '🛒', desc: 'Use your Amazon Pay balance' },
    ];

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(99,102,241,0.12)',
                border: '0.5px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2
            }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{
                maxWidth: '88%', borderRadius: '16px 16px 16px 4px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.07))',
                border: '0.5px solid rgba(99,102,241,0.25)',
                overflow: 'hidden', width: '100%'
            }}>
                <div style={{ padding: '12px 14px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, margin: '0 0 10px' }}>
                        💳 Select Payment Method
                    </p>

                    {/* Payment options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {paymentMethods.map(method => (
                            <div
                                key={method.id}
                                onClick={() => setSelected(method.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                                    background: selected === method.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                                    border: `0.5px solid ${selected === method.id ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'}`,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <span style={{ fontSize: 16 }}>{method.emoji}</span>
                                <div style={{ flex: 1 }}>
                                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500, margin: 0 }}>{method.label}</p>
                                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: 0 }}>{method.desc}</p>
                                </div>
                                <div style={{
                                    width: 14, height: 14, borderRadius: '50%',
                                    border: `1.5px solid ${selected === method.id ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.2)'}`,
                                    background: selected === method.id ? 'rgba(99,102,241,0.6)' : 'transparent',
                                    transition: 'all 0.2s ease', flexShrink: 0
                                }} />
                            </div>
                        ))}
                    </div>

                    {/* UPI ID input */}
                    {selected === 'upi' && (
                        <div style={{ marginBottom: 10 }}>
                            <input
                                type="text"
                                value={upiId}
                                onChange={e => setUpiId(e.target.value)}
                                onKeyDown={e => e.stopPropagation()}
                                placeholder="Enter UPI ID (e.g. name@upi)"
                                style={{
                                    width: '100%', padding: '8px 10px', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '0.5px solid rgba(255,255,255,0.12)',
                                    color: 'rgba(255,255,255,0.85)', fontSize: 12,
                                    outline: 'none', boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={() => {
                                if (!selected) return;
                                onSelect({ method: selected, upiId: selected === 'upi' ? upiId : undefined });
                            }}
                            disabled={!selected || (selected === 'upi' && !upiId)}
                            style={{
                                flex: 1, padding: '8px 0', borderRadius: 8,
                                fontSize: 12, fontWeight: 500, cursor: selected ? 'pointer' : 'not-allowed',
                                background: selected ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))' : 'rgba(255,255,255,0.04)',
                                border: `0.5px solid ${selected ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                color: selected ? 'rgba(214,221,255,0.95)' : 'rgba(255,255,255,0.3)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            Continue →
                        </button>
                        <button
                            onClick={onCancel}
                            style={{
                                padding: '8px 14px', borderRadius: 8, fontSize: 12,
                                background: 'rgba(255,255,255,0.04)',
                                border: '0.5px solid rgba(255,255,255,0.1)',
                                color: 'rgba(255,255,255,0.4)', cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

const AgentAwaitAddressCard = React.memo(({ platform, paymentInfo, onAddressDetected, onCancel }) => {
    const [polling, setPolling] = useState(false);
    const [detected, setDetected] = useState(false);
    const pollRef = useRef(null);

    const startPolling = () => {
        setPolling(true);
        pollRef.current = setInterval(async () => {
            const result = await window.buddyAgent.checkoutStep({
                type: `${platform.toLowerCase()}_poll_address`
            });
            if (result.success && result.hasAddress) {
                clearInterval(pollRef.current);
                setDetected(true);
                setPolling(false);
                onAddressDetected();
            }
        }, 2000); // Poll every 2 seconds

        // Safety timeout — stop polling after 3 minutes
        setTimeout(() => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                setPolling(false);
            }
        }, 180000);
    };

    useEffect(() => {
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(234,179,8,0.12)',
                border: '0.5px solid rgba(234,179,8,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2
            }}>
                <Sparkles size={9} style={{ color: 'rgba(250,204,21,0.8)' }} />
            </div>
            <div style={{
                maxWidth: '88%', borderRadius: '16px 16px 16px 4px',
                background: 'linear-gradient(135deg, rgba(15,15,22,0.95), rgba(20,14,30,0.92))',
                border: '0.5px solid rgba(234,179,8,0.2)',
                padding: '14px', width: '100%'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>📦</span>
                    <div>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: 0 }}>
                            Delivery Address Required
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, margin: 0 }}>
                            Buddy will detect it automatically once you add it
                        </p>
                    </div>
                </div>

                {/* Steps */}
                <div style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '0.5px solid rgba(255,255,255,0.07)'
                }}>
                    {[
                        '1️⃣ Look at the browser window that just opened',
                        '2️⃣ Add or select your delivery address there',
                        '3️⃣ Buddy will automatically detect when it\'s done',
                        '4️⃣ Payment will be selected and order confirmed here'
                    ].map((step, idx) => (
                        <p key={idx} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '0 0 4px', lineHeight: 1.5 }}>{step}</p>
                    ))}
                </div>

                {/* Polling status */}
                {polling && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', borderRadius: 8, marginBottom: 10,
                        background: 'rgba(52,211,153,0.06)',
                        border: '0.5px solid rgba(52,211,153,0.2)'
                    }}>
                        <div style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: 'rgba(52,211,153,0.9)',
                            boxShadow: '0 0 6px rgba(52,211,153,0.8)',
                            animation: 'pulse 1s ease-in-out infinite',
                            flexShrink: 0
                        }} />
                        <p style={{ color: 'rgba(52,211,153,0.7)', fontSize: 11, margin: 0 }}>
                            Watching for address... Add it in the browser now
                        </p>
                    </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                    {!polling && !detected && (
                        <button
                            onClick={startPolling}
                            style={{
                                flex: 1, padding: '8px 0', borderRadius: 8,
                                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                background: 'linear-gradient(135deg, rgba(234,179,8,0.2), rgba(202,138,4,0.15))',
                                border: '0.5px solid rgba(234,179,8,0.4)',
                                color: 'rgba(254,240,138,0.95)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            👁️ Watch for Address
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 14px', borderRadius: 8, fontSize: 12,
                            background: 'rgba(255,255,255,0.04)',
                            border: '0.5px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
});

const AgentAwaitLoginCard = React.memo(({ platform, isFirstLogin = false, paymentInfo, onLoginDetected, onCancel }) => {
    const [polling, setPolling] = useState(false);
    const [detected, setDetected] = useState(false);
    const pollRef = useRef(null);

    const startPolling = () => {
        if (!platform) return;
        setPolling(true);
        pollRef.current = setInterval(async () => {
            const result = await window.buddyAgent.checkoutStep({
                type: `${platform.toLowerCase()}_poll_login`
            });
            if (result.success && result.isLoggedIn) {
                clearInterval(pollRef.current);
                setDetected(true);
                setPolling(false);
                if (onLoginDetected) onLoginDetected();
                setTimeout(() => {
                    window.electronAPI?.positionCenter?.();
                }, 400);
            }
        }, 2000); // Poll every 2 seconds

        // Safety timeout — stop polling after 3 minutes
        setTimeout(() => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                setPolling(false);
            }
        }, 180000);
    };

    useEffect(() => {
        if (platform) {
            startPolling();
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [platform]);

    if (!platform || !onLoginDetected) {
        console.error('[Buddy] AgentAwaitLoginCard missing required props', { platform, onLoginDetected });
        return null;
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(99,102,241,0.12)',
                border: '0.5px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2
            }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{
                maxWidth: '88%', borderRadius: '16px 16px 16px 4px',
                background: 'linear-gradient(135deg, rgba(15,15,22,0.95), rgba(20,14,30,0.92))',
                border: '0.5px solid rgba(99,102,241,0.2)',
                padding: '14px', width: '100%'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>🔐</span>
                    <div>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: 0 }}>
                            {isFirstLogin ? `Sign in to ${platform} to continue` : `Sign in to complete checkout`}
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, margin: 0 }}>
                            {isFirstLogin ? 'Log in to Amazon in the browser - Buddy will detect it automatically' : 'Login required to proceed with payment'}
                        </p>
                    </div>
                </div>

                {/* Steps */}
                <div style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '0.5px solid rgba(255,255,255,0.07)'
                }}>
                    {[
                        '1️⃣ Look at the browser window that just opened',
                        '2️⃣ Enter your login credentials there',
                        '3️⃣ Buddy will automatically detect when you\'re logged in',
                        '4️⃣ Payment will be selected and order confirmed here'
                    ].map((step, idx) => (
                        <p key={idx} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '0 0 4px', lineHeight: 1.5 }}>{step}</p>
                    ))}
                </div>

                {/* Polling status */}
                {polling && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', borderRadius: 8, marginBottom: 10,
                        background: 'rgba(52,211,153,0.06)',
                        border: '0.5px solid rgba(52,211,153,0.2)'
                    }}>
                        <div style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: 'rgba(52,211,153,0.9)',
                            boxShadow: '0 0 6px rgba(52,211,153,0.8)',
                            animation: 'pulse 1s ease-in-out infinite',
                            flexShrink: 0
                        }} />
                        <p style={{ color: 'rgba(52,211,153,0.7)', fontSize: 11, margin: 0 }}>
                            Watching for login... Sign in to the browser now
                        </p>
                    </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                    {!polling && !detected && (
                        <button
                            onClick={startPolling}
                            style={{
                                flex: 1, padding: '8px 0', borderRadius: 8,
                                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))',
                                border: '0.5px solid rgba(99,102,241,0.4)',
                                color: 'rgba(214,221,255,0.95)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            👁️ Watch for Login
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 14px', borderRadius: 8, fontSize: 12,
                            background: 'rgba(255,255,255,0.04)',
                            border: '0.5px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
});

const AgentProductApprovalCard = React.memo(({ message, onSubmit, onCancel }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const { products } = message;

    useEffect(() => {
        const p = products?.[currentIndex];
        if (p && p.url) {
            window.buddyAgent.checkoutStep({
                type: 'amazon_preview_product',
                url: p.url
            }).catch(e => console.error("Preview error:", e));
        }
    }, [currentIndex, products]);
    
    if (!products || products.length === 0) return null;
    if (currentIndex >= products.length) {
        return (
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Sparkles size={9} style={{ color: 'rgba(248,113,113,0.8)' }} />
                </div>
                <div style={{ maxWidth: '88%', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', padding: '12px', width: '100%' }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 10px' }}>No more products matched your criteria.</p>
                    <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
            </div>
        );
    }
    
    const p = products[currentIndex];
    if (!p) return <p style={{ color: 'white' }}>Loading...</p>;
    
    return (
        <div style={{
            display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start',
            // compact layout for side-pop mode
        }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{ maxWidth: '88%', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(15,15,22,0.95), rgba(20,14,30,0.92))', border: '0.5px solid rgba(99,102,241,0.2)', padding: '12px', width: '100%' }}>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: '0 0 10px' }}>
                    🛒 Approve Product ({currentIndex + 1}/{products.length})
                </p>
                <div style={{ display: 'flex', gap: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, border: '0.5px solid rgba(255,255,255,0.06)' }}>
                    {p.image && <img src={p.image || ""} alt={p.title || 'Product'} style={{ width: 70, height: 70, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: '0 0 4px', lineHeight: 1.3 }}>
                            {p.title ? (p.title.length > 70 ? p.title.slice(0, 67) + '...' : p.title) : 'Unknown'}
                        </p>
                        <p style={{ color: 'rgba(96,165,250,0.9)', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
                            {p.price ? (typeof p.price === 'string' && p.price.includes('₹') ? p.price : `₹${p.price}`) : 'Price unavailable'}
                        </p>
                        {p.rating ? <p style={{ color: 'rgba(250,204,21,0.9)', fontSize: 11, margin: 0 }}>⭐ {p.rating}</p> : null}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button onClick={() => onSubmit(p)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))', border: '0.5px solid rgba(99,102,241,0.4)', color: 'rgba(214,221,255,0.95)', cursor: 'pointer' }}>✓ Buy This</button>
                    <button onClick={() => setCurrentIndex(currentIndex + 1)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>⏭ Skip</button>
                    <button onClick={onCancel} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>Cancel</button>
                </div>
            </div>
        </div>
    );
});

const AgentPreCheckoutCard = React.memo(({ platform, onSubmit, onCancel }) => {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(234,179,8,0.12)', border: '0.5px solid rgba(234,179,8,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Sparkles size={9} style={{ color: 'rgba(250,204,21,0.8)' }} />
            </div>
            <div style={{ maxWidth: '88%', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(15,15,22,0.95), rgba(20,14,30,0.92))', border: '0.5px solid rgba(234,179,8,0.2)', padding: '14px', width: '100%' }}>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: '0 0 10px' }}>❓ Checkout Verification</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>
                    The product is in your cart. Should I proceed to checkout and place the order on {platform}?
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={onSubmit} style={{ width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.15))', border: '0.5px solid rgba(52,211,153,0.4)', color: 'rgba(110,231,183,0.95)', cursor: 'pointer' }}>✅ Yes, proceed to buy</button>
                    <button onClick={onCancel} style={{ width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>❌ No, let me do it manually</button>
                </div>
            </div>
        </div>
    );
});

const ProductApprovalCard = React.memo(({ products, currentIndex, onApprove, onSkip, onCancel }) => {
    const safeIndex = Math.min(currentIndex || 0, (products?.length || 1) - 1);
    const product = products?.[safeIndex];
    if (!product) {
        return (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                No more products to show.
            </div>
        );
    }
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{ maxWidth: '88%', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(14,14,22,0.95), rgba(20,14,30,0.92))', border: '0.5px solid rgba(99,102,241,0.2)', overflow: 'hidden', width: '100%' }}>
                <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>Option {currentIndex + 1} of {products.length}</p>
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, margin: 0 }}>
                            {product.rating && `⭐ ${product.rating}`} {product.reviews && `(${product.reviews})`}
                        </p>
                    </div>
                    {product.image && (
                        <div style={{ width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', marginBottom: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={product.image} alt={product.title} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                        </div>
                    )}
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '0 0 4px', lineHeight: 1.4 }}>{product.title?.slice(0, 80)}</p>
                    <p style={{ color: 'rgba(96,165,250,0.9)', fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>₹{product.price?.toLocaleString?.()}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => onApprove(product)} style={{
                            flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                            background: 'linear-gradient(135deg, rgba(52,211,153,0.25), rgba(59,130,246,0.2))',
                            border: '0.5px solid rgba(52,211,153,0.4)', color: 'rgba(200,255,230,0.95)'
                        }}>✓ Yes, Add to Cart</button>
                        {currentIndex < products.length - 1 && (
                            <button onClick={onSkip} style={{
                                padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                                background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                                color: 'rgba(255,255,255,0.5)'
                            }}>Next →</button>
                        )}
                        <button onClick={onCancel} style={{
                            padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.3)'
                        }}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
});

const PreCheckoutCard = React.memo(({ platform, onConfirm, onCancel }) => {
    const [checked, setChecked] = useState([]);
    const [otherText, setOtherText] = useState('');
    const [showOther, setShowOther] = useState(false);

    const questions = [
        { id: 'return', label: '📦 Does this item have at least 7-day return policy?' },
        { id: 'cancel', label: '❌ Can I cancel this order before delivery?' },
        { id: 'warranty', label: '🛡️ Is there a warranty included?' },
        { id: 'delivery', label: '🚚 What is the estimated delivery time?' },
        { id: 'genuine', label: '✅ Is this a genuine/original product?' },
        { id: 'cod', label: '💵 Is Cash on Delivery available for this item?' },
    ];

    const toggle = (id) => setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{ maxWidth: '88%', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(14,14,22,0.95), rgba(20,14,30,0.92))', border: '0.5px solid rgba(99,102,241,0.2)', padding: '12px 14px', width: '100%' }}>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>📋 Before proceeding - any questions?</p>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: '0 0 10px' }}>Select what you&apos;d like to know, or skip to proceed</p>
                {questions.map(q => (
                    <div key={q.id} onClick={() => toggle(q.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                        borderRadius: 8, marginBottom: 5, cursor: 'pointer',
                        background: checked.includes(q.id) ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `0.5px solid ${checked.includes(q.id) ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                        transition: 'all 0.2s ease'
                    }}>
                        <div style={{
                            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${checked.includes(q.id) ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.2)'}`,
                            background: checked.includes(q.id) ? 'rgba(99,102,241,0.6)' : 'transparent'
                        }} />
                        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, margin: 0, lineHeight: 1.4 }}>{q.label}</p>
                    </div>
                ))}
                <div onClick={() => setShowOther(p => !p)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    borderRadius: 8, marginBottom: showOther ? 6 : 10, cursor: 'pointer',
                    background: showOther ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `0.5px solid ${showOther ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${showOther ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.2)'}`, background: showOther ? 'rgba(99,102,241,0.6)' : 'transparent' }} />
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, margin: 0 }}>💬 Others - type your question</p>
                </div>
                {showOther && (
                    <input
                        type="text" value={otherText}
                        onChange={e => setOtherText(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        placeholder="Type your question..."
                        style={{
                            width: '100%', padding: '7px 10px', borderRadius: 8, marginBottom: 10,
                            background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.85)', fontSize: 12, outline: 'none', boxSizing: 'border-box'
                        }}
                    />
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onConfirm({ questions: checked, other: otherText })} style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))',
                        border: '0.5px solid rgba(99,102,241,0.4)', color: 'rgba(214,221,255,0.95)'
                    }}>
                        {checked.length > 0 || otherText ? '📋 Ask & Proceed' : '✓ Proceed to Checkout'}
                    </button>
                    <button onClick={onCancel} style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.3)'
                    }}>Cancel</button>
                </div>
            </div>
        </div>
    );
});

const LeftSidebar = React.memo(({ isOpen, onClose, sessions = [], activeSession, onSelect, onNew }) => {
    // Group sessions by relative date
    const grouped = useMemo(() => {
        const groups = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] };
        const now = new Date();
        sessions.forEach(s => {
            const d = new Date(s.id);
            const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) groups.Today.push(s);
            else if (diffDays === 1) groups.Yesterday.push(s);
            else if (diffDays <= 7) groups['Previous 7 Days'].push(s);
            else groups.Older.push(s);
        });
        return groups;
    }, [sessions]);

    return (
        <div style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, width: 260, zIndex: 100,
            background: 'rgba(10,10,14,0.95)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex', flexDirection: 'column',
            boxShadow: isOpen ? '20px 0 50px rgba(0,0,0,0.5)' : 'none'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <button onClick={onClose} style={{
                    background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4
                }}>
                    <Menu size={18} />
                </button>
                <button onClick={onNew} style={{
                    background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.9)',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.2s'
                }}>
                    <Plus size={14} /> New chat
                </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 20px' }}>
                {sessions.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        No history yet
                    </div>
                )}
                {Object.entries(grouped).map(([label, items]) => items.length > 0 && (
                    <div key={label} style={{ marginBottom: 20 }}>
                        <h4 style={{
                            margin: '0 0 8px 8px', fontSize: 11, fontWeight: 600,
                            color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase'
                        }}>{label}</h4>
                        {items.map(s => (
                            <div
                                key={s.id}
                                onClick={() => { onSelect(s); onClose(); }}
                                style={{
                                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                                    background: activeSession?.id === s.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    transition: 'all 0.15s ease',
                                    display: 'flex', alignItems: 'center', gap: 12
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = activeSession?.id !== s.id ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.background = activeSession?.id === s.id ? 'rgba(255,255,255,0.08)' : 'transparent'}
                            >
                                <MessageSquare size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <p style={{
                                        color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, fontWeight: 400,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}>{s.title}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
});

const AgentSelectCard = React.memo(({ action, options = [], onSelect, onLoadMore }) => {
    if (!action) {
        console.error("Spotlight crash: missing action in AgentSelectCard");
        return <div>Spotlight Error</div>;
    }

    if (!options || options.length === 0) {
        return <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Loading...</p>;
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(99,102,241,0.12)',
                border: '0.5px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2
            }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{
                maxWidth: '88%', borderRadius: '16px 16px 16px 4px',
                background: 'linear-gradient(135deg, rgba(15,15,22,0.95), rgba(20,14,30,0.92))',
                border: '0.5px solid rgba(99,102,241,0.2)',
                padding: '12px', width: '100%'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <div>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: 0 }}>
                            Multiple options found
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: 0 }}>
                            Select an item within your ₹{action?.budget ?? ''} budget
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {(options || []).map((opt, i) => (
                        <div key={i} style={{
                            padding: '10px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            border: '0.5px solid rgba(255,255,255,0.06)',
                            display: 'flex', flexDirection: 'column', gap: 6
                        }}>
                            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: 0, lineHeight: 1.3 }}>
                                {(opt?.title || '').length > 60 ? (opt?.title || '').slice(0, 57) + '...' : (opt?.title || 'Untitled item')}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ color: 'rgba(96,165,250,0.9)', fontSize: 14, fontWeight: 600 }}>
                                        ₹{opt.price}
                                    </span>
                                    {opt.rating > 0 && (
                                        <span style={{ color: 'rgba(250,204,21,0.9)', fontSize: 11, fontWeight: 500 }}>
                                            ⭐ {opt.rating}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => onSelect(opt)}
                                    style={{
                                        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                                        background: 'rgba(59,130,246,0.15)',
                                        border: '0.5px solid rgba(59,130,246,0.3)',
                                        color: 'rgba(147,197,253,0.9)', cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    Select
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onLoadMore}
                    style={{
                        width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12,
                        background: 'rgba(255,255,255,0.04)',
                        border: '0.5px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.5)', cursor: 'pointer'
                    }}
                >
                    ⬇️ Show more options
                </button>
            </div>
        </div>
    );
});

const AgentRebudgetCard = React.memo(({ action, originalBudget, cheapestAvailable, cheapestTitle, onSubmit }) => {
    const [newBudget, setNewBudget] = useState('');

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(99,102,241,0.12)',
                border: '0.5px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2
            }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{
                maxWidth: '88%', borderRadius: '16px 16px 16px 4px',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(99,102,241,0.06))',
                border: '0.5px solid rgba(239,68,68,0.25)',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '12px 14px' }}>
                    {/* Warning header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 500, margin: 0 }}>
                            No items found within ₹{originalBudget}
                        </p>
                    </div>

                    {/* Cheapest available */}
                    {cheapestAvailable && (
                        <div style={{
                            padding: '8px 10px', borderRadius: 8, marginBottom: 10,
                            background: 'rgba(255,255,255,0.04)',
                            border: '0.5px solid rgba(255,255,255,0.07)'
                        }}>
                            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: '0 0 3px', letterSpacing: '0.05em' }}>CHEAPEST AVAILABLE</p>
                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '0 0 2px' }}>{cheapestTitle}</p>
                            <p style={{ color: 'rgba(96,165,250,0.9)', fontSize: 13, fontWeight: 600, margin: 0 }}>₹{cheapestAvailable}</p>
                        </div>
                    )}

                    {/* New budget input */}
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '0 0 6px' }}>
                        Enter a new budget to try again:
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            type="number"
                            value={newBudget}
                            onChange={e => setNewBudget(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && newBudget) onSubmit(newBudget); }}
                            placeholder={cheapestAvailable ? `e.g. ${cheapestAvailable}` : 'Enter budget'}
                            style={{
                                flex: 1, padding: '7px 10px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)',
                                border: '0.5px solid rgba(255,255,255,0.12)',
                                color: 'rgba(255,255,255,0.85)', fontSize: 12,
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={() => { if (newBudget) onSubmit(newBudget); }}
                            disabled={!newBudget}
                            style={{
                                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                                background: newBudget ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))' : 'rgba(255,255,255,0.04)',
                                border: `0.5px solid ${newBudget ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                color: newBudget ? 'rgba(214,221,255,0.95)' : 'rgba(255,255,255,0.3)',
                                cursor: newBudget ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

// Separate component so it has its own state — cannot use useState inside useMemo
const AgentConfirmCard = ({ msg, index, setMessages, setCurrentAction, handleApprove }) => {
    const action = msg?.action;
    const [budget, setBudget] = useState('');
    if (!action) {
        console.error('[Buddy] AgentConfirmCard missing action prop', msg);
        return null;
    }
    return (
        <div className="message-enter" style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
            </div>
            <div style={{ maxWidth: '88%', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))', border: '0.5px solid rgba(99,102,241,0.25)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px 8px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 6px' }}>Here&apos;s what I&apos;ll do:</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.07)', marginBottom: 10 }}>
                        <span style={{ fontSize: 18 }}>{action.emoji}</span>
                        <div>
                            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500, margin: 0 }}>{action.platform}</p>
                            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>{action.description}</p>
                        </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '0 0 5px' }}>💰 Max budget (₹) — optional</p>
                        <input
                            type="number"
                            placeholder="e.g. 2000  (leave blank = no limit)"
                            value={budget}
                            onChange={e => setBudget(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.9)', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={() => {
                                console.log("BUTTON CLICKED");
                                handleApprove({ ...msg.action, budget: budget || null });
                            }}
                            style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))', border: '0.5px solid rgba(99,102,241,0.4)', color: 'rgba(214,221,255,0.95)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                        >
                            ✓ Approve
                        </button>
                        <button
                            onClick={() => {
                                setMessages(prev => prev.map((m, idx) => idx === index ? { role: 'buddy', text: 'Cancelled! Let me know if you need anything else.', timestamp: m.timestamp } : m));
                            }}
                            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
                <div style={{ padding: '6px 14px 8px', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, margin: 0 }}>
                        ⚡ Buddy will open {msg.action.platform} in Chrome and navigate for you
                    </p>
                </div>
            </div>
        </div>
    );
};

// ────────────────────────────────────────────────────────────────────────
// AutomationCard — shared card UI for all automation status messages
// Used by: role='agent-status', type='automation', type='status'
// ────────────────────────────────────────────────────────────────────────
const AUTOMATION_ACCENT_MAP = {
    '✅': 'rgba(52,211,153,',
    '⚠️': 'rgba(239,68,68,',
    '🛒': 'rgba(99,102,241,',
    '💰': 'rgba(234,179,8,',
    '🔍': 'rgba(59,130,246,',
    '⚡': 'rgba(139,92,246,',
    '✨': 'rgba(99,102,241,',
    '📦': 'rgba(59,130,246,',
    '🔐': 'rgba(234,179,8,',
};

const AutomationCard = ({ icon = '✨', title, description, text, timestamp, index }) => {
    const accent = AUTOMATION_ACCENT_MAP[icon] || 'rgba(99,102,241,';
    return (
        <div className="message-enter" style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            {/* Accent avatar */}
            <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: `${accent}0.12)`,
                border: `0.5px solid ${accent}0.35)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2
            }}>
                <Sparkles size={9} style={{ color: `${accent}0.9)` }} />
            </div>
            {/* Card body */}
            <div style={{
                maxWidth: '88%',
                borderRadius: '16px 16px 16px 4px',
                background: `linear-gradient(135deg, ${accent}0.1), ${accent}0.06))`,
                border: `0.5px solid ${accent}0.25)`,
                padding: '10px 14px',
            }}>
                {/* Header row: icon + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (description || text) ? 4 : 0 }}>
                    <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                    {title && (
                        <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: 600, margin: 0 }}>
                            {title}
                        </p>
                    )}
                </div>
                {/* Description */}
                {description && (
                    <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: 12, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {description}
                    </p>
                )}
                {/* Fallback plain text (when no title/description) */}
                {!title && !description && text && (
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {text}
                    </p>
                )}
                {/* Timestamp */}
                {timestamp && (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', display: 'block', marginTop: 4 }}>
                        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </div>
        </div>
    );
};

const ChatPanel = React.memo(({ chatOpen, isLoading, isTyping, messages = [], onClose, chatEndRef, setMessages, setChatOpen, setSidebarVisible, setPendingAgentAction, setCurrentAction, setAgentStep, handleApprove, handleManualLoginDetected }) => {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const safeMessages = Array.isArray(messages) ? messages : [];

    const cardStyle = {
        background: "rgba(20, 20, 40, 0.6)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "16px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
        marginBottom: "12px",
        maxWidth: "420px"
    };

    const systemMsg = {
        color: "rgba(255,255,255,0.6)",
        fontSize: "13px",
        margin: "6px 0"
    };

    // messageList useMemo removed — rendering is now done directly in JSX via messages.map below



    return (
        <div
            style={{
                ...glassCard,
                position: 'relative',
                borderRadius: chatOpen ? 0 : '0 0 20px 20px',
                overflow: 'hidden',
                maxHeight: chatOpen ? 460 : 0,
                opacity: chatOpen ? 1 : 0,
                transition: 'max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, border-radius 0.35s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: chatOpen ? 'translateY(0)' : 'translateY(8px)',
                background: 'linear-gradient(180deg, rgba(12,12,20,0.88) 0%, rgba(16,14,24,0.85) 100%)',
                backdropFilter: 'blur(40px) saturate(160%)',
                WebkitBackdropFilter: 'blur(40px) saturate(160%)',
                borderBottom: chatOpen ? '0.5px solid rgba(255,255,255,0.06)' : 'none'
            }}
        >
            <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px 10px', flexShrink: 0,
                borderBottom: '0.5px solid rgba(255,255,255,0.05)'
            }}>
                {/* Left side — title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))',
                        border: '0.5px solid rgba(139,92,246,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Sparkles size={11} style={{ color: 'rgba(167,139,250,0.9)' }} />
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>Buddy AI</span>
                    <div style={{
                        padding: '2px 8px', borderRadius: 100, fontSize: 10,
                        background: 'rgba(52,211,153,0.1)',
                        border: '0.5px solid rgba(52,211,153,0.25)',
                        color: 'rgba(52,211,153,0.8)'
                    }}>gemini-1.5-flash</div>
                </div>

                {/* Right side — action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Clear chat */}
                    <button
                        onClick={() => { setMessages([]); setChatOpen(false); setSidebarVisible(true); setSettingsOpen(false); }}
                        title="Clear chat"
                        style={{
                            width: 26, height: 26, borderRadius: 8,
                            border: '0.5px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = 'rgba(239,68,68,0.8)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                    >
                        <X size={12} strokeWidth={1.5} />
                    </button>

                    {/* Settings */}
                    <button
                        onClick={() => setSettingsOpen(prev => !prev)}
                        title="Settings"
                        style={{
                            width: 26, height: 26, borderRadius: 8,
                            border: `0.5px solid ${settingsOpen ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            background: settingsOpen ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            color: settingsOpen ? 'rgba(139,92,246,0.9)' : 'rgba(255,255,255,0.4)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Settings size={12} strokeWidth={1.5} />
                    </button>

                    {/* Collapse */}
                    <button
                        onClick={() => { setChatOpen(false); setSidebarVisible(true); setSettingsOpen(false); }}
                        title="Collapse"
                        style={{
                            width: 26, height: 26, borderRadius: 8,
                            border: '0.5px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                    >
                        <ChevronDown size={12} strokeWidth={1.5} />
                    </button>
                </div>
            </div>

            <div className="overflow-y-auto px-5 pb-4 flex flex-col gap-[12px]" style={{ maxHeight: 370 }}>
                {messages.map((msg, i) => {

                    // USER MESSAGE
                    if (msg.role === "user") {
                        return (
                            <div key={i} style={{ textAlign: "right", margin: "8px 0" }}>
                                <div style={{
                                    display: "inline-block",
                                    padding: "8px 12px",
                                    borderRadius: "12px",
                                    background: "#4f46e5",
                                    color: "#fff",
                                    fontSize: 13
                                }}>
                                    {msg.text}
                                </div>
                            </div>
                        );
                    }

                    // AGENT CONFIRM (KEEP YOUR EXISTING UI)
                    if (msg.role === "agent-confirm") {
                        return <AgentConfirmCard key={i} msg={msg} index={i} setMessages={setMessages} setCurrentAction={setCurrentAction} handleApprove={handleApprove} />;
                    }

                    // LOGIN WAIT
                    if (msg.role === "await-login") {
                        return (
                            <AgentAwaitLoginCard
                                key={i}
                                platform={msg.platform || 'Amazon'}
                                isFirstLogin={true}
                                onLoginDetected={async () => {
                                    handleManualLoginDetected();
                                }}
                                onCancel={() => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '❌ Search cancelled.', timestamp: Date.now() }
                                            : m
                                    ));
                                }}
                            />
                        );
                    }

                    // PRODUCTS (One-by-one carousel)
                    if (msg.role === "product-selection") {
                        const items = msg.items || [];
                        if (!items.length) return null;

                        // Use msg.currentIndex as the pointer — default 0
                        const currentIdx = typeof msg.currentIndex === 'number' ? msg.currentIndex : 0;
                        const product = items[currentIdx];
                        if (!product) {
                            return (
                                <div key={i} style={{
                                    padding: '12px 14px', borderRadius: 12,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '0.5px solid rgba(255,255,255,0.08)',
                                    color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center'
                                }}>
                                    ✅ All products reviewed.
                                </div>
                            );
                        }

                        const goNext = () => {
                            const nextIdx = currentIdx + 1;
                            setMessages(prev => prev.map((m, mIdx) =>
                                mIdx === i ? { ...m, currentIndex: nextIdx, _highlightTriggered: false } : m
                            ));
                        };

                        const handleBuy = async () => {
                            setMessages(prev => prev.map((m, mIdx) =>
                                mIdx === i ? {
                                    role: 'buddy',
                                    text: `👀 "${(product.title || 'item').slice(0, 55)}" — ₹${product.price?.toLocaleString()}\n\nLet me check a few things before adding to cart...`,
                                    timestamp: m.timestamp || Date.now()
                                } : m
                            ).concat({
                                role: 'pre-checkout',
                                platform: msg.platform || 'Amazon',
                                selectedProduct: product,
                                timestamp: Date.now()
                            }));
                        };

                        const handleCancel = () => {
                            setMessages(prev => prev.map((m, mIdx) =>
                                mIdx === i ? {
                                    role: 'buddy',
                                    text: '❌ Search cancelled. Let me know if you need anything else!',
                                    timestamp: Date.now()
                                } : m
                            ));
                        };

                        // Highlight current product in browser whenever currentIdx changes.
                        // NOTE: hooks (useEffect) cannot be called inside .map() — using safe IIFE guard instead.
                        (() => {
                            const product = items?.[currentIdx];
                            if (product?.url && !msg._highlightTriggered) {
                                window._highlightLocks = window._highlightLocks || {};
                                const lockKey = `${msg.timestamp}-${currentIdx}`;
                                
                                if (!window._highlightLocks[lockKey]) {
                                    window._highlightLocks[lockKey] = true; // Robust global lock
                                    
                                    setTimeout(async () => {
                                        try {
                                            await window.buddyAgent?.checkoutStep?.({
                                                type: 'amazon_highlight_product',
                                                url: product.url
                                            });
                                        } catch (err) {
                                            // SILENT FAIL for background highlights — avoids "Already running" clutter
                                            console.log('[Buddy] Background highlight skipped:', err.message);
                                        } finally {
                                            // Show and center after navigation & auto-scroll is complete
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                        }
                                    }, 0);

                                    setMessages(prev => prev.map((m, mIdx) =>
                                        mIdx === i ? { ...m, _highlightTriggered: true } : m
                                    ));
                                }
                            } else if (!product?.url && !msg._highlightTriggered) {
                                // Fallback if no URL is available to highlight
                                setTimeout(() => {
                                    window.electronAPI?.positionShow?.();
                                    window.electronAPI?.positionCenter?.();
                                }, 0);
                                setMessages(prev => prev.map((m, mIdx) =>
                                    mIdx === i ? { ...m, _highlightTriggered: true } : m
                                ));
                            }
                        })();

                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>

                                {/* Buddy avatar dot */}
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: 'rgba(99,102,241,0.12)',
                                    border: '0.5px solid rgba(99,102,241,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, marginTop: 2
                                }}>
                                    <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
                                </div>

                                {/* Product card */}
                                <div style={{
                                    maxWidth: '88%', width: '100%',
                                    borderRadius: '16px 16px 16px 4px',
                                    background: 'linear-gradient(135deg, rgba(14,14,22,0.98), rgba(20,12,32,0.96))',
                                    border: '0.5px solid rgba(99,102,241,0.3)',
                                    overflow: 'hidden',
                                    boxShadow: '0 8px 32px rgba(99,102,241,0.15)'
                                }}>

                                    {/* Header bar */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '9px 14px',
                                        background: 'rgba(99,102,241,0.08)',
                                        borderBottom: '0.5px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 500 }}>
                                            🛍️ Product {currentIdx + 1} of {items.length}
                                        </span>
                                        {/* Progress dots */}
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            {items.map((_, di) => (
                                                <div key={di} style={{
                                                    width: 6, height: 6, borderRadius: '50%',
                                                    background: di === currentIdx
                                                        ? 'rgba(99,102,241,1)'
                                                        : di < currentIdx
                                                            ? 'rgba(52,211,153,0.7)'
                                                            : 'rgba(255,255,255,0.15)',
                                                    transition: 'all 0.3s ease'
                                                }} />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Product info */}
                                    <div style={{ padding: '12px 14px' }}>

                                        {/* Title */}
                                        <p style={{
                                            color: 'rgba(255,255,255,0.88)', fontSize: 12,
                                            fontWeight: 500, margin: '0 0 8px', lineHeight: 1.45
                                        }}>
                                            {(product.title || 'Unknown product').slice(0, 100)}
                                            {(product.title || '').length > 100 ? '...' : ''}
                                        </p>
                                        
                                        <div style={{ padding: '8px 10px', background: 'rgba(52,211,153,0.1)', borderRadius: 8, margin: '8px 0', border: '0.5px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <p style={{ margin: 0, fontSize: 11, color: 'rgba(52,211,153,0.9)' }}>
                                                👀 Buddy is reviewing this item on Chrome right now.
                                            </p>
                                        </div>

                                        {/* Price + Rating */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center',
                                            justifyContent: 'space-between', marginBottom: 10
                                        }}>
                                            <span style={{
                                                color: 'rgba(96,165,250,0.95)', fontSize: 20,
                                                fontWeight: 700, letterSpacing: '-0.02em'
                                            }}>
                                                {product.price
                                                    ? (String(product.price).includes('₹')
                                                        ? product.price
                                                        : `₹${Number(product.price).toLocaleString('en-IN')}`)
                                                    : 'N/A'}
                                            </span>
                                            {product.rating && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    padding: '3px 9px', borderRadius: 100,
                                                    background: 'rgba(250,204,21,0.08)',
                                                    border: '0.5px solid rgba(250,204,21,0.22)'
                                                }}>
                                                    <span style={{ fontSize: 11 }}>⭐</span>
                                                    <span style={{ color: 'rgba(250,204,21,0.9)', fontSize: 11, fontWeight: 600 }}>
                                                        {product.rating}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Live browser indicator */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '5px 10px', borderRadius: 8, marginBottom: 12,
                                            background: 'rgba(52,211,153,0.05)',
                                            border: '0.5px solid rgba(52,211,153,0.15)'
                                        }}>
                                            <div style={{
                                                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                                background: 'rgba(52,211,153,0.9)',
                                                boxShadow: '0 0 6px rgba(52,211,153,0.8)',
                                                animation: 'pulse 1.5s ease-in-out infinite'
                                            }} />
                                            <span style={{ color: 'rgba(52,211,153,0.65)', fontSize: 10 }}>
                                                🟢 Highlighted in Amazon browser window
                                            </span>
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {/* Buy */}
                                            <button onClick={handleBuy} style={{
                                                flex: 2, padding: '9px 0', borderRadius: 10,
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                background: 'linear-gradient(135deg, rgba(52,211,153,0.22), rgba(16,185,129,0.16))',
                                                border: '0.5px solid rgba(52,211,153,0.4)',
                                                color: 'rgba(167,243,208,0.95)',
                                                transition: 'all 0.2s ease'
                                            }}>
                                                ✓ Buy This
                                            </button>

                                            {/* Next — only if more products */}
                                            {currentIdx < items.length - 1 && (
                                                <button onClick={goNext} style={{
                                                    flex: 1, padding: '9px 0', borderRadius: 10,
                                                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '0.5px solid rgba(255,255,255,0.1)',
                                                    color: 'rgba(255,255,255,0.55)',
                                                    transition: 'all 0.2s ease'
                                                }}>
                                                    Next ⏭
                                                </button>
                                            )}

                                            {/* Cancel */}
                                            <button onClick={handleCancel} style={{
                                                padding: '9px 11px', borderRadius: 10,
                                                fontSize: 12, cursor: 'pointer',
                                                background: 'rgba(239,68,68,0.05)',
                                                border: '0.5px solid rgba(239,68,68,0.18)',
                                                color: 'rgba(248,113,113,0.6)',
                                                transition: 'all 0.2s ease'
                                            }}>
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'pre-checkout') {
                        return (
                            <PreCheckoutCard
                                key={i}
                                platform={msg.platform || 'Amazon'}
                                onConfirm={async ({ questions, other }) => {
                                    const qMap = {
                                        return: '📦 Return: Most Amazon items have 7-30 day return window.',
                                        cancel: '❌ Cancel: You can cancel before shipment from Your Orders.',
                                        warranty: '🛡️ Warranty: Check product description or contact seller.',
                                        delivery: '🚚 Delivery: Usually 2-5 business days.',
                                        genuine: '✅ Genuine: Look for "Sold by Amazon" or authorized sellers.',
                                        cod: '💵 COD: Available for most items — shown at checkout.'
                                    };
                                    const answers = (questions || []).map(q => qMap[q]).filter(Boolean);
                                    if (other) answers.push(`💬 "${other}" — verify on Amazon directly.`);
                                    
                                    const product = msg.selectedProduct;
                                    if (!product?.url) {
                                        setMessages(prev => [...prev, { role: 'buddy', text: '⚠️ Product URL missing. Please try again.', timestamp: Date.now() }]);
                                        return;
                                    }
                                    
                                    const platform = (msg.platform || 'amazon').toLowerCase();

                                    setMessages(prev => prev.map((m, idx) => idx === i ? {
                                        role: 'buddy',
                                        text: (answers.length ? answers.join('\n\n') + '\n\n' : '') + '✅ Please review the final details before adding to cart.',
                                        timestamp: m.timestamp || Date.now()
                                    } : m).concat({
                                        role: 'final-approval',
                                        platform,
                                        selectedProduct: product,
                                        timestamp: Date.now()
                                    }));
                                }}
                                onCancel={() => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '❌ Checkout cancelled. You can complete it manually in the browser.', timestamp: Date.now() }
                                            : m
                                    ));
                                }}
                            />
                        );
                    }

                    if (msg.role === 'final-approval') {
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                    <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
                                </div>
                                <div style={{ maxWidth: '88%', width: '100%', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(14,14,22,0.98), rgba(20,12,32,0.96))', border: '0.5px solid rgba(99,102,241,0.3)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(99,102,241,0.15)' }}>
                                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                                            Review Item Details
                                        </p>
                                        <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.05)' }}>
                                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{(msg.selectedProduct?.title || 'Item').slice(0, 50)}...</p>
                                            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'rgba(96,165,250,0.95)', fontWeight: 600 }}>{msg.selectedProduct?.price || ''}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={async () => {
                                                const product = msg.selectedProduct;
                                                const platform = (msg.platform || 'amazon').toLowerCase();
                                                
                                                setMessages(prev => prev.map((m, mIdx) => mIdx === i ? {
                                                    role: 'buddy',
                                                    text: '✅ Confirmed! Analyzing your cart...',
                                                    timestamp: Date.now()
                                                } : m));

                                                if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();

                                                const analysisResult = await window.buddyAgent.checkoutStep({
                                                    type: platform === 'flipkart' ? 'flipkart_analyze_cart' : 'amazon_analyze_cart',
                                                    targetUrl: product.url,
                                                    targetTitle: product.title
                                                });

                                                window.electronAPI?.positionShow?.();
                                                window.electronAPI?.positionCenter?.();

                                                if (!analysisResult?.success) {
                                                    setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Failed to analyze cart: ${analysisResult?.error || 'Unknown error'}. Continuing standard checkout.`, timestamp: Date.now() }]);
                                                }

                                                const cartStatus = analysisResult?.cartStatus || 'unknown';

                                                if (cartStatus === 'duplicate_target') {
                                                    setMessages(prev => [...prev, {
                                                        role: 'cart-conflict-duplicate',
                                                        platform,
                                                        selectedProduct: product,
                                                        otherItems: analysisResult.otherItems || [],
                                                        timestamp: Date.now()
                                                    }]);
                                                    return;
                                                } 
                                                
                                                if (cartStatus === 'target_and_others') {
                                                    setMessages(prev => [...prev, { role: 'buddy', text: '✅ Adding your item to cart...', timestamp: Date.now() }]);
                                                    
                                                    if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                                    const addResult = await window.buddyAgent.checkoutStep({
                                                        type: platform === 'flipkart' ? 'flipkart_add_to_cart' : 'amazon_add_to_cart',
                                                        url: product.url
                                                    });

                                                    if (!addResult?.success && !addResult?.addedToCart) {
                                                        window.electronAPI?.positionShow?.();
                                                        window.electronAPI?.positionCenter?.();
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Failed to add to cart: ${addResult?.error || 'Unknown'}.`, timestamp: Date.now() }]);
                                                        return;
                                                    }

                                                    setMessages(prev => [...prev, { role: 'buddy', text: '✅ Verifying cart...', timestamp: Date.now() }]);
                                                    const verifyResult = await window.buddyAgent.checkoutStep({
                                                        type: 'amazon_verify_cart_target',
                                                        targetUrl: product.url
                                                    });

                                                    if (!verifyResult?.success) {
                                                        window.electronAPI?.positionShow?.();
                                                        window.electronAPI?.positionCenter?.();
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Verification Failed: ${verifyResult?.reason || 'target_product_missing'}. Aborting workflow.`, timestamp: Date.now() }]);
                                                        return;
                                                    }

                                                    setMessages(prev => [...prev, { role: 'buddy', text: '✅ Isolating item and proceeding to checkout...', timestamp: Date.now() }]);
                                                    const checkoutResult = await window.buddyAgent.checkoutStep({
                                                        type: 'amazon_smart_checkout',
                                                        mode: 'selected_only',
                                                        targetUrl: product.url,
                                                        targetTitle: product.title
                                                    });
                                                    window.electronAPI?.positionShow?.();
                                                    window.electronAPI?.positionCenter?.();

                                                    if (!checkoutResult?.success) {
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Checkout failed'}`, timestamp: Date.now() }]);
                                                        return;
                                                    }
                                                    if (checkoutResult.needsLogin) { setMessages(prev => [...prev, { role: 'checkout-login', platform, timestamp: Date.now() }]); return; }
                                                    if (checkoutResult.needsAddress) { setMessages(prev => [...prev, { role: 'address-required', platform, timestamp: Date.now() }]); return; }
                                                    setMessages(prev => [...prev, { role: 'payment-select', platform, timestamp: Date.now() }]);
                                                    return;
                                                }

                                                setMessages(prev => [...prev, { role: 'buddy', text: '✅ Adding to cart and verifying...', timestamp: Date.now() }]);

                                                if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();

                                                if (cartStatus === 'empty' || cartStatus === 'unknown') {
                                                    const cartResult = await window.buddyAgent.checkoutStep({
                                                        type: platform === 'flipkart' ? 'flipkart_add_to_cart' : 'amazon_add_to_cart',
                                                        url: product.url
                                                    });
                                                    if (!cartResult?.success && !cartResult?.addedToCart) {
                                                        window.electronAPI?.positionShow?.();
                                                        window.electronAPI?.positionCenter?.();
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${cartResult?.error || 'Failed to add to cart'}`, timestamp: Date.now() }]);
                                                        return;
                                                    }

                                                    const verifyResult = await window.buddyAgent.checkoutStep({
                                                        type: 'amazon_verify_cart_target',
                                                        targetUrl: product.url
                                                    });

                                                    if (!verifyResult?.success) {
                                                        window.electronAPI?.positionShow?.();
                                                        window.electronAPI?.positionCenter?.();
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Verification Failed: ${verifyResult?.reason || 'target_product_missing'}. Aborting workflow.`, timestamp: Date.now() }]);
                                                        return;
                                                    }
                                                }

                                                const checkoutResult = await window.buddyAgent.checkoutStep({
                                                    type: `${platform}_goto_checkout`
                                                });

                                                window.electronAPI?.positionShow?.();
                                                window.electronAPI?.positionCenter?.();

                                                if (!checkoutResult?.success) {
                                                    setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Failed to proceed to checkout'}`, timestamp: Date.now() }]);
                                                    return;
                                                }

                                                if (checkoutResult.needsLogin) {
                                                    setMessages(prev => [...prev, { role: 'checkout-login', platform, timestamp: Date.now() }]);
                                                    return;
                                                }

                                                if (checkoutResult.needsAddress) {
                                                    setMessages(prev => [...prev, { role: 'address-required', platform, timestamp: Date.now() }]);
                                                    return;
                                                }

                                                setMessages(prev => [...prev, { role: 'payment-select', platform, timestamp: Date.now() }]);
                                            }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'rgba(99,102,241,0.9)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                Confirm & Proceed
                                            </button>
                                            <button onClick={() => {
                                                setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { role: 'buddy', text: '❌ Checkout cancelled.', timestamp: Date.now() } : m));
                                            }} style={{ padding: '0 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: 'rgba(248,113,113,0.9)', fontSize: 12, fontWeight: 500, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'cart-conflict-others') {
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2
                                }}>
                                    <span style={{ fontSize: 10 }}>🛒</span>
                                </div>
                                <div style={{
                                    flex: 1, padding: '14px', borderRadius: 16,
                                    background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
                                    display: 'flex', flexDirection: 'column', gap: 12
                                }}>
                                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                                        Cart contains additional items.
                                    </p>
                                    <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.05)' }}>
                                        <p style={{ margin: '0 0 4px 0', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Selected Product:</p>
                                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{(msg.selectedProduct?.title || 'Item').slice(0, 50)}...</p>
                                    </div>
                                    <div style={{ padding: '10px', background: 'rgba(239,68,68,0.05)', borderRadius: 8, border: '0.5px solid rgba(239,68,68,0.1)' }}>
                                        <p style={{ margin: '0 0 6px 0', fontSize: 11, color: 'rgba(248,113,113,0.8)' }}>Additional Items Found ({msg.otherItems?.length || 0}):</p>
                                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                                            {(msg.otherItems || []).slice(0, 3).map((item, idx) => (
                                                <li key={idx} style={{ marginBottom: 4 }}>{item.title.slice(0, 40)}...</li>
                                            ))}
                                            {(msg.otherItems || []).length > 3 && <li>...and more</li>}
                                        </ul>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                        <button onClick={async () => {
                                            setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { ...m, role: 'buddy', text: '✅ Isolating item and proceeding to checkout...' } : m));
                                            if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                            const checkoutResult = await window.buddyAgent.checkoutStep({
                                                type: 'amazon_smart_checkout',
                                                mode: 'selected_only',
                                                targetUrl: msg.selectedProduct.url,
                                                targetTitle: msg.selectedProduct.title
                                            });
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            
                                            if (!checkoutResult?.success) {
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Checkout failed'}`, timestamp: Date.now() }]);
                                                return;
                                            }
                                            if (checkoutResult.needsLogin) { setMessages(prev => [...prev, { role: 'checkout-login', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            if (checkoutResult.needsAddress) { setMessages(prev => [...prev, { role: 'address-required', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            setMessages(prev => [...prev, { role: 'payment-select', platform: msg.platform, timestamp: Date.now() }]);
                                        }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '0.5px solid rgba(99,102,241,0.3)', color: 'rgba(165,180,252,1)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                                            Checkout Only Selected
                                        </button>
                                        <button onClick={async () => {
                                            setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { ...m, role: 'buddy', text: '✅ Proceeding to checkout with entire cart...' } : m));
                                            if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                            const checkoutResult = await window.buddyAgent.checkoutStep({
                                                type: 'amazon_smart_checkout',
                                                mode: 'entire_cart',
                                                targetUrl: msg.selectedProduct.url,
                                                targetTitle: msg.selectedProduct.title
                                            });
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            
                                            if (!checkoutResult?.success) {
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Checkout failed'}`, timestamp: Date.now() }]);
                                                return;
                                            }
                                            if (checkoutResult.needsLogin) { setMessages(prev => [...prev, { role: 'checkout-login', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            if (checkoutResult.needsAddress) { setMessages(prev => [...prev, { role: 'address-required', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            setMessages(prev => [...prev, { role: 'payment-select', platform: msg.platform, timestamp: Date.now() }]);
                                        }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', fontSize: 12, cursor: 'pointer' }}>
                                            Checkout Entire Cart
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'cart-conflict-duplicate') {
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: 'rgba(245,158,11,0.12)', border: '0.5px solid rgba(245,158,11,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2
                                }}>
                                    <span style={{ fontSize: 10 }}>⚠️</span>
                                </div>
                                <div style={{
                                    flex: 1, padding: '14px', borderRadius: 16,
                                    background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
                                    display: 'flex', flexDirection: 'column', gap: 12
                                }}>
                                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                                        This product already exists in your cart.
                                    </p>
                                    <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.05)' }}>
                                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{(msg.selectedProduct?.title || 'Item').slice(0, 50)}...</p>
                                        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'rgba(96,165,250,0.95)', fontWeight: 600 }}>{msg.selectedProduct?.price || ''}</p>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                                        <button onClick={async () => {
                                            setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { ...m, role: 'buddy', text: '✅ Using existing item in cart...' } : m));
                                            
                                            // Isolate (or full cart if no other items)
                                            if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                            const checkoutResult = await window.buddyAgent.checkoutStep({
                                                type: 'amazon_smart_checkout',
                                                mode: (msg.otherItems && msg.otherItems.length > 0) ? 'selected_only' : 'entire_cart',
                                                targetUrl: msg.selectedProduct.url,
                                                targetTitle: msg.selectedProduct.title
                                            });
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            if (!checkoutResult?.success) {
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Checkout failed'}`, timestamp: Date.now() }]);
                                                return;
                                            }
                                            if (checkoutResult.needsLogin) { setMessages(prev => [...prev, { role: 'checkout-login', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            if (checkoutResult.needsAddress) { setMessages(prev => [...prev, { role: 'address-required', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            setMessages(prev => [...prev, { role: 'payment-select', platform: msg.platform, timestamp: Date.now() }]);
                                        }} style={{ padding: '10px 0', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '0.5px solid rgba(99,102,241,0.3)', color: 'rgba(165,180,252,1)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                                            Use Existing Cart Item
                                        </button>
                                        <button onClick={async () => {
                                            setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { ...m, role: 'buddy', text: '✅ Increasing quantity (adding another one)...' } : m));
                                            if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                            const addResult = await window.buddyAgent.checkoutStep({
                                                type: msg.platform === 'flipkart' ? 'flipkart_add_to_cart' : 'amazon_add_to_cart',
                                                url: msg.selectedProduct.url
                                            });
                                            if (!addResult?.success && !addResult?.addedToCart) {
                                                window.electronAPI?.positionShow?.();
                                                window.electronAPI?.positionCenter?.();
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Failed to add to cart: ${addResult?.error || 'Unknown'}.`, timestamp: Date.now() }]);
                                                return;
                                            }

                                            const checkoutResult = await window.buddyAgent.checkoutStep({
                                                type: 'amazon_smart_checkout',
                                                mode: (msg.otherItems && msg.otherItems.length > 0) ? 'selected_only' : 'entire_cart',
                                                targetUrl: msg.selectedProduct.url,
                                                targetTitle: msg.selectedProduct.title
                                            });
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            if (!checkoutResult?.success) {
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Checkout failed'}`, timestamp: Date.now() }]);
                                                return;
                                            }
                                            if (checkoutResult.needsLogin) { setMessages(prev => [...prev, { role: 'checkout-login', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            if (checkoutResult.needsAddress) { setMessages(prev => [...prev, { role: 'address-required', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            setMessages(prev => [...prev, { role: 'payment-select', platform: msg.platform, timestamp: Date.now() }]);
                                        }} style={{ padding: '10px 0', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', fontSize: 12, cursor: 'pointer' }}>
                                            Increase Quantity
                                        </button>
                                        <button onClick={async () => {
                                            setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { ...m, role: 'buddy', text: '✅ Removing old items and re-adding fresh...' } : m));
                                            if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                            
                                            await window.buddyAgent.checkoutStep({
                                                type: 'amazon_remove_target_from_cart',
                                                targetUrl: msg.selectedProduct.url
                                            });

                                            const addResult = await window.buddyAgent.checkoutStep({
                                                type: msg.platform === 'flipkart' ? 'flipkart_add_to_cart' : 'amazon_add_to_cart',
                                                url: msg.selectedProduct.url
                                            });

                                            if (!addResult?.success && !addResult?.addedToCart) {
                                                window.electronAPI?.positionShow?.();
                                                window.electronAPI?.positionCenter?.();
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Failed to add to cart: ${addResult?.error || 'Unknown'}.`, timestamp: Date.now() }]);
                                                return;
                                            }

                                            const checkoutResult = await window.buddyAgent.checkoutStep({
                                                type: 'amazon_smart_checkout',
                                                mode: (msg.otherItems && msg.otherItems.length > 0) ? 'selected_only' : 'entire_cart',
                                                targetUrl: msg.selectedProduct.url,
                                                targetTitle: msg.selectedProduct.title
                                            });
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            if (!checkoutResult?.success) {
                                                setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${checkoutResult?.error || 'Checkout failed'}`, timestamp: Date.now() }]);
                                                return;
                                            }
                                            if (checkoutResult.needsLogin) { setMessages(prev => [...prev, { role: 'checkout-login', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            if (checkoutResult.needsAddress) { setMessages(prev => [...prev, { role: 'address-required', platform: msg.platform, timestamp: Date.now() }]); return; }
                                            setMessages(prev => [...prev, { role: 'payment-select', platform: msg.platform, timestamp: Date.now() }]);
                                        }} style={{ padding: '10px 0', borderRadius: 8, background: 'rgba(239,68,68,0.05)', border: '0.5px solid rgba(239,68,68,0.1)', color: 'rgba(248,113,113,0.8)', fontSize: 12, cursor: 'pointer' }}>
                                            Remove Old And Re-Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'checkout-login') {
                        return (
                            <AgentAwaitLoginCard
                                key={i}
                                platform={msg.platform || 'Amazon'}
                                onLoginDetected={async () => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '✅ Login detected! Proceeding to checkout...', timestamp: Date.now() }
                                            : m
                                    ));
                                    
                                    // Hide during automated navigation to checkout
                                    window.electronAPI?.positionHide?.();

                                    // After login, re-run goto_checkout to get to payment page
                                    const platform = (msg.platform || 'Amazon').toLowerCase();
                                    const checkoutResult = await window.buddyAgent.checkoutStep({
                                        type: `${platform}_goto_checkout`
                                    });

                                    // Restore Buddy when loading completes
                                    window.electronAPI?.positionShow?.();
                                    window.electronAPI?.positionCenter?.();

                                    if (checkoutResult?.needsAddress) {
                                        setMessages(prev => [...prev, {
                                            role: 'address-required',
                                            platform: msg.platform || 'Amazon',
                                            timestamp: Date.now()
                                        }]);
                                        return;
                                    }
                                    setMessages(prev => [...prev, {
                                        role: 'payment-select',
                                        platform: msg.platform || 'Amazon',
                                        timestamp: Date.now()
                                    }]);
                                }}
                                onCancel={() => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '❌ Checkout cancelled.', timestamp: Date.now() }
                                            : m
                                    ));
                                }}
                            />
                        );
                    }

                    if (msg.role === 'address-required') {
                        return (
                            <AgentAwaitAddressCard
                                key={i}
                                platform={msg.platform || 'Amazon'}
                                onAddressDetected={async () => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '✅ Address detected! Submitting...', timestamp: Date.now() }
                                            : m
                                    ));

                                    // Hide during automated address submission
                                    window.electronAPI?.positionHide?.();

                                    const platform = (msg.platform || 'Amazon').toLowerCase();
                                    const submitResult = await window.buddyAgent.checkoutStep({
                                        type: `${platform}_submit_address`
                                    });

                                    // Restore Buddy when completed
                                    window.electronAPI?.positionShow?.();
                                    window.electronAPI?.positionCenter?.();

                                    if (submitResult?.needsLogin) {
                                        setMessages(prev => [...prev, {
                                            role: 'checkout-login',
                                            platform: msg.platform || 'Amazon',
                                            timestamp: Date.now()
                                        }]);
                                        return;
                                    }
                                    setMessages(prev => [...prev, {
                                        role: 'payment-select',
                                        platform: msg.platform || 'Amazon',
                                        timestamp: Date.now()
                                    }]);
                                }}
                                onCancel={() => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '❌ Checkout cancelled.', timestamp: Date.now() }
                                            : m
                                    ));
                                }}
                            />
                        );
                    }

                    if (msg.role === 'payment-select') {
                        return (
                            <PaymentOptionsCard
                                key={i}
                                platform={msg.platform || 'Amazon'}
                                onSelect={async ({ method, upiId }) => {
                                    // Append a temporary buddy message about selection starting
                                    setMessages(prev => [...prev, {
                                        role: 'buddy',
                                        text: `⚡ Attempting to select ${method.toUpperCase()} payment...`,
                                        timestamp: Date.now()
                                    }]);

                                    // Hide during automated payment method selection
                                    if (window.electronAPI?.positionHide) {
                                        await window.electronAPI.positionHide();
                                    }

                                    const result = await window.buddyAgent.checkoutStep({
                                        type: 'amazon_select_payment',
                                        method,
                                        upiId
                                    });

                                    if (result?.success) {
                                        if (result.requiresManualEntry) {
                                            // Keep Buddy hidden while user enters details
                                            window.electronAPI?.positionHide?.();
                                            
                                            setMessages(prev => prev.map((m, idx) =>
                                                idx === i
                                                    ? { role: 'buddy', text: `Please enter your card details in the browser securely. Click 'Done' when finished.`, timestamp: Date.now() }
                                                    : m
                                            ).concat({
                                                role: 'manual-card-entry',
                                                timestamp: Date.now()
                                            }));
                                        } else {
                                            // Restore Buddy when selection completed
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            
                                            // Map the payment card to buddy text since it succeeded, and append final confirm
                                            setMessages(prev => prev.map((m, idx) =>
                                                idx === i
                                                    ? { role: 'buddy', text: `✅ Selected ${method.toUpperCase()} payment successfully!`, timestamp: Date.now() }
                                                    : m
                                            ).concat({
                                                role: 'final-confirm',
                                                timestamp: Date.now()
                                            }));
                                        }
                                    } else {
                                        // Failed — convert current card to buddy, append error, append new payment card
                                        setMessages(prev => prev.map((m, mIdx) => 
                                            mIdx === i ? { role: 'buddy', text: `❌ Failed to apply ${method.toUpperCase()}.`, timestamp: Date.now() } : m
                                        ).concat([
                                            {
                                                role: 'buddy',
                                                text: `⚠️ Could not select ${method.toUpperCase()} payment: ${result?.error || 'Unknown error'}. Please try another payment method.`,
                                                timestamp: Date.now()
                                            },
                                            {
                                                role: 'payment-select',
                                                platform: msg.platform || 'Amazon',
                                                timestamp: Date.now()
                                            }
                                        ]));
                                    }
                                }}
                                onCancel={() => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: '❌ Payment cancelled.', timestamp: Date.now() }
                                            : m
                                    ));
                                }}
                            />
                        );
                    }

                    if (msg.role === 'manual-card-entry') {
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: 'rgba(139,92,246,0.12)',
                                    border: '0.5px solid rgba(139,92,246,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, marginTop: 2
                                }}>
                                    <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
                                </div>
                                <div style={{
                                    maxWidth: '88%', width: '100%',
                                    borderRadius: '16px 16px 16px 4px',
                                    background: 'linear-gradient(135deg, rgba(14,14,22,0.98), rgba(20,12,32,0.96))',
                                    border: '0.5px solid rgba(139,92,246,0.3)',
                                    padding: '14px'
                                }}>
                                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>
                                        💳 Manual Card Entry
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, margin: '0 0 14px', lineHeight: 1.5 }}>
                                        Buddy is spectating. Please enter your card details on Amazon and click Done.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();
                                            
                                            setMessages(prev => [...prev, {
                                                role: 'buddy',
                                                text: 'Verifying card details and proceeding...',
                                                timestamp: Date.now()
                                            }]);

                                            window.electronAPI?.positionHide?.();
                                            
                                            const verifyResult = await window.buddyAgent.checkoutStep({
                                                type: 'amazon_verify_card_and_continue'
                                            });

                                            window.electronAPI?.positionShow?.();
                                            window.electronAPI?.positionCenter?.();

                                            if (verifyResult?.success) {
                                                setMessages(prev => prev.map((m, idx) =>
                                                    idx === i
                                                        ? { role: 'buddy', text: '✅ Card details verified. Proceeding to review...', timestamp: Date.now() }
                                                        : m
                                                ).concat({
                                                    role: 'final-confirm',
                                                    timestamp: Date.now()
                                                }));
                                            } else {
                                                setMessages(prev => [...prev, {
                                                    role: 'buddy',
                                                    text: `⚠️ Verification failed: ${verifyResult?.error || 'Could not verify card details'}. Please ensure you completed the card entry and try clicking Done again.`,
                                                    timestamp: Date.now()
                                                }]);
                                            }
                                        }}
                                        style={{
                                            width: '100%', padding: '9px 0', borderRadius: 10,
                                            background: 'rgba(139,92,246,0.2)', border: '0.5px solid rgba(139,92,246,0.4)',
                                            color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                            transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center'
                                        }}
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'final-confirm') {
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: 'rgba(52,211,153,0.12)',
                                    border: '0.5px solid rgba(52,211,153,0.35)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, marginTop: 2
                                }}>
                                    <Sparkles size={9} style={{ color: 'rgba(52,211,153,0.9)' }} />
                                </div>
                                <div style={{
                                    maxWidth: '88%', width: '100%',
                                    borderRadius: '16px 16px 16px 4px',
                                    background: 'linear-gradient(135deg, rgba(14,14,22,0.98), rgba(20,12,32,0.96))',
                                    border: '0.5px solid rgba(52,211,153,0.25)',
                                    padding: '14px'
                                }}>
                                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>
                                        🏁 Ready to place your order
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, margin: '0 0 14px', lineHeight: 1.5 }}>
                                        Payment is selected. Buddy will now click "Place Order" in the browser. This is your last chance to cancel.
                                    </p>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            onClick={async () => {
                                                setMessages(prev => prev.map((m, idx) =>
                                                    idx === i
                                                        ? { role: 'buddy', text: '⚡ Placing your order...', timestamp: Date.now() }
                                                        : m
                                                ));

                                                // Hide during order placement automation
                                                window.electronAPI?.positionHide?.();

                                                const result = await window.buddyAgent.checkoutStep({
                                                    type: 'amazon_place_order'
                                                });

                                                // Restore Buddy upon completion
                                                window.electronAPI?.positionShow?.();
                                                window.electronAPI?.positionCenter?.();

                                                setMessages(prev => [...prev, {
                                                    role: 'buddy',
                                                    text: result?.orderPlaced
                                                        ? '🎉 Order placed successfully! Check your email for confirmation.'
                                                        : result?.message || '⚠️ Could not confirm order. Please check the browser.',
                                                    timestamp: Date.now()
                                                }]);
                                            }}
                                            style={{
                                                flex: 1, padding: '9px 0', borderRadius: 10,
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                background: 'linear-gradient(135deg, rgba(52,211,153,0.22), rgba(16,185,129,0.16))',
                                                border: '0.5px solid rgba(52,211,153,0.4)',
                                                color: 'rgba(167,243,208,0.95)'
                                            }}
                                        >
                                            ✅ Place Order
                                        </button>
                                        <button
                                            onClick={() => {
                                                setMessages(prev => prev.map((m, idx) =>
                                                    idx === i
                                                        ? { role: 'buddy', text: '❌ Order cancelled. Browser is still open if you want to do it manually.', timestamp: Date.now() }
                                                        : m
                                                ));
                                            }}
                                            style={{
                                                padding: '9px 14px', borderRadius: 10, fontSize: 12,
                                                cursor: 'pointer',
                                                background: 'rgba(239,68,68,0.06)',
                                                border: '0.5px solid rgba(239,68,68,0.2)',
                                                color: 'rgba(248,113,113,0.7)'
                                            }}
                                        >
                                            ✕ Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'rebudget') {
                        return (
                            <AgentRebudgetCard
                                key={i}
                                action={msg.action}
                                originalBudget={msg.originalBudget}
                                cheapestAvailable={msg.cheapestAvailable}
                                cheapestTitle={msg.cheapestTitle}
                                onSubmit={async (newBudget) => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? { role: 'buddy', text: `🔍 Searching again with budget ₹${newBudget}...`, timestamp: Date.now() }
                                            : m
                                    ));
                                    const updatedAction = { ...msg.action, budget: newBudget };
                                    setCurrentAction(updatedAction);
                                    const result = await window.buddyAgent.checkoutStep({
                                        type: 'amazon_search',
                                        query: updatedAction.query,
                                        budget: newBudget
                                    });
                                    if (!result?.success) {
                                        setMessages(prev => [...prev, {
                                            role: 'rebudget',
                                            action: updatedAction,
                                            originalBudget: newBudget,
                                            cheapestAvailable: result?.cheapestAvailable,
                                            cheapestTitle: result?.cheapestTitle,
                                            timestamp: Date.now()
                                        }]);
                                    } else {
                                        setMessages(prev => [...prev, {
                                            role: 'product-selection',
                                            items: (result.products || []).slice(0, 5),
                                            currentIndex: 0,
                                            _browserScrolled: false,
                                            timestamp: Date.now()
                                        }]);
                                    }
                                }}
                            />
                        );
                    }

                    // DEFAULT (buddy)
                    return (
                        <div key={i} style={{ margin: 8, color: "rgba(255,255,255,0.6)", fontSize: 13, display: 'flex', gap: 8 }}>
                            <div style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, background: 'rgba(59,130,246,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={10} color="#60a5fa" />
                            </div>
                            <div>{msg.text || "..." }</div>
                        </div>
                    );

                })}
                {(isLoading || isTyping) && (
                    <div className="message-enter" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div className="typing-avatar" style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                            <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} className="animate-pulse" />
                        </div>
                        <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.07) 100%)', border: '0.5px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 4px 12px rgba(99,102,241,0.1)' }}>
                            <style>{`
                                @keyframes typingDot {
                                    0%, 60%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
                                    30% { transform: translateY(-5px) scale(1.1); opacity: 1; }
                                }
                                .typing-dot {
                                    width: 6px; height: 6px; border-radius: 50%;
                                    background: linear-gradient(135deg, rgba(96,165,250,1), rgba(139,92,246,1));
                                    animation: typingDot 1.4s ease-in-out infinite;
                                }
                                .typing-dot:nth-child(2) { animation-delay: 0.2s; }
                                .typing-dot:nth-child(3) { animation-delay: 0.4s; }
                            `}</style>
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>
            <SettingsPanel visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
});

const InputBar = React.memo(({ chatOpen, isLoading, isListening, sttOnline, onEscape, onSubmit, onMicClick, inputRef }) => (
    <div
        className="buddy-input-bar"
        style={{
            ...glassCard,
            borderRadius: chatOpen ? '0 0 20px 20px' : 20,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            transition: 'border-radius 0.3s ease',
            background: 'linear-gradient(135deg, rgba(15,15,22,0.85) 0%, rgba(20,18,30,0.82) 100%)',
            backdropFilter: 'blur(40px) saturate(160%)',
            WebkitBackdropFilter: 'blur(40px) saturate(160%)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderTop: '0.5px solid rgba(99,102,241,0.35)',
            boxShadow: '0 -4px 24px rgba(59,130,246,0.06), 0 32px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)'
        }}
    >
        <div className="flex items-center gap-2 shrink-0" style={{ paddingLeft: 2 }}>
            <BuddyLogo size="xs" pulse={!isLoading} />
            <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(96,165,250,1) 0%, rgba(139,92,246,1) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
            }}>BUDDY</span>
        </div>

        <div style={{ width: '0.5px', height: 18, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

        <CommandInput
            ref={inputRef}
            isLoading={isLoading}
            isListening={isListening}
            sttOnline={sttOnline}
            onEscape={onEscape}
            onSubmit={onSubmit}
            onMicClick={onMicClick}
        />
    </div>
));

const SettingsPanel = React.memo(({ visible, onClose }) => (
    <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: '75%', zIndex: 10,
        transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1), opacity 0.35s ease',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        background: 'linear-gradient(135deg, rgba(14,14,22,0.98) 0%, rgba(18,14,28,0.98) 100%)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderLeft: '0.5px solid rgba(255,255,255,0.08)',
        borderRadius: '0 0 20px 0',
        display: 'flex', flexDirection: 'column',
        padding: '16px',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.3)'
    }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>Settings</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)' }}>
                <X size={14} strokeWidth={1.5} />
            </button>
        </div>

        {/* Settings items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Model info */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.06em', margin: '0 0 4px' }}>AI MODEL</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>gemini-1.5-flash</p>
            </div>

            {/* Shortcut info */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.06em', margin: '0 0 4px' }}>GLOBAL SHORTCUT</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>Ctrl + Alt + B</p>
            </div>

            {/* Voice status */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.06em', margin: '0 0 4px' }}>VOICE INPUT</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px rgba(52,211,153,0.8)' }} />
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>Always listening</p>
                </div>
            </div>

            {/* Wake word */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.06em', margin: '0 0 4px' }}>WAKE WORD</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>"Hey Buddy"</p>
            </div>

            {/* Version */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.06em', margin: '0 0 4px' }}>VERSION</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, fontFamily: 'monospace' }}>Buddy v1.0.0</p>
            </div>
        </div>
    </div>
));

const parseAgentCommand = (text) => {
    const lower = text.toLowerCase().trim();

    // Food ordering
    if (lower.includes('zomato') || (lower.includes('order') && lower.includes('food')) || (lower.includes('order') && lower.includes('eat'))) {
        const query = lower.replace(/order|food|from|zomato|on|me|i want|get/g, '').trim() || 'food';
        return {
            type: 'zomato_search',
            query,
            platform: 'Zomato',
            description: `Search for "${query}" on Zomato`,
            emoji: '🍔'
        };
    }
    if (lower.includes('swiggy')) {
        const query = lower.replace(/order|food|from|swiggy|on|me|i want|get/g, '').trim() || 'food';
        return {
            type: 'swiggy_search',
            query,
            platform: 'Swiggy',
            description: `Search for "${query}" on Swiggy`,
            emoji: '🍕'
        };
    }

    // Shopping — Amazon
    if (lower.includes('amazon') || (lower.includes('order') && lower.includes('product'))) {
        // Strip noise words but keep the actual product terms
        let query = lower
            .replace(/\b(order|buy|get|from|amazon|on|me|i want|product|please|can you|could you|help me|open|and|for)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        // If query is empty or too short, fall back to input without just 'amazon'
        if (!query || query.length < 2) {
            query = lower.replace(/\bamazon\b/gi, '').replace(/\s+/g, ' ').trim();
        }
        // Last resort fallback
        if (!query || query.length < 2) {
            query = 'products';
        }
        return {
            type: 'amazon_search',
            query,
            platform: 'Amazon',
            description: `Search for "${query}" on Amazon`,
            emoji: '📦'
        };
    }
    if (lower.includes('flipkart')) {
        const query = lower.replace(/order|buy|get|from|flipkart|on|me|i want/g, '').trim() || 'product';
        return {
            type: 'flipkart_search',
            query,
            platform: 'Flipkart',
            description: `Search for "${query}" on Flipkart`,
            emoji: '🛍️'
        };
    }

    // Cab booking
    if (lower.includes('ola') || (lower.includes('book') && lower.includes('cab'))) {
        const destination = lower.replace(/book|cab|ola|ride|to|a|an|me/g, '').trim();
        return {
            type: 'ola_open',
            destination,
            platform: 'Ola',
            description: `Book an Ola cab${destination ? ` to "${destination}"` : ''}`,
            emoji: '🚕'
        };
    }
    if (lower.includes('uber')) {
        return {
            type: 'uber_open',
            platform: 'Uber',
            description: 'Open Uber to book a ride',
            emoji: '🚗'
        };
    }

    // Movie tickets
    if (lower.includes('bookmyshow') || (lower.includes('book') && lower.includes('ticket')) || (lower.includes('book') && lower.includes('movie'))) {
        const movie = lower.replace(/book|ticket|tickets|movie|on|bookmyshow|for|me|watch/g, '').trim();
        return {
            type: 'bookmyshow_search',
            movie,
            platform: 'BookMyShow',
            description: `Search for "${movie || 'movies'}" on BookMyShow`,
            emoji: '🎬'
        };
    }

    return null;
};

const Spotlight = React.memo(() => {
    const [messages, setMessages] = useState(() => {
        const history = getHistory();
        return Array.isArray(history) ? history : [];
    });
    const [chatSessions, setChatSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [pendingAgentAction, setPendingAgentAction] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [sidebarVisible, setSidebarVisible] = useState(true);
    const [showSplash, setShowSplash] = useState(true);
    const [mainVisible, setMainVisible] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [sttOnline, setSttOnline] = useState(false);
    // true while the Amazon workflow is waiting for the user's budget reply
    const [isWaitingForInput, setIsWaitingForInput] = useState(false);
    // tracks the action currently being executed (shared with login/search handlers)
    const [currentAction, setCurrentAction] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    // state-machine step: idle → approved → login → search → done
    const [agentStep, setAgentStep] = useState('idle');
    const inputRef = useRef(null);
    const lastUsedResponsesRef = useRef({});
    const chatEndRef = useRef(null);
    const messagesRef = useRef(messages);
    const loadingRef = useRef(isLoading);
    const pollRef = useRef(null);
    const hasStarted = useRef(false);
    // Promise resolver for chat-based budget input
    const resolveUserInputRef = useRef(null);

    // Handles user clicking a product from the product-selection card
    const handleApprove = async (action) => {
        try {
            console.log("🔥 APPROVE CLICKED", action);

            if (!action) {
                alert("No action found");
                return;
            }

            // Save action (including budget)
            setCurrentAction({ ...action, budget: action.budget || null });

            // Hide Buddy during login check and search automation!
            window.electronAPI?.positionHide?.();

            // CLEAR any old flow noise
            setMessages(prev => [
                ...prev,
                {
                    role: "buddy",
                    text: "Checking login status...",
                    timestamp: Date.now()
                }
            ]);

            // 1. Check if already logged in FIRST
            const loginCheck = await window.buddyAgent.checkoutStep({
                type: "amazon_poll_login"
            });

            if (loginCheck?.isLoggedIn) {
                // Already logged in — skip login step, go straight to search
                setMessages(prev => [...prev, {
                    role: "buddy",
                    text: `✅ Already logged in! Searching Amazon for "${action.query}"...`,
                    timestamp: Date.now()
                }]);
                
                const result = await window.buddyAgent.execute({
                    type: "amazon_search",
                    query: action.query,
                    budget: action.budget || null,
                    preferences: action.preferences || null,
                    brand: action.brand || null
                });
                
                if (result?.budgetExceeded) {
                    window.electronAPI?.positionShow?.();
                    window.electronAPI?.positionCenter?.();
                    setMessages(prev => [...prev, {
                        role: 'rebudget',
                        action: action,
                        originalBudget: result.originalBudget,
                        cheapestAvailable: result.cheapestAvailable,
                        cheapestTitle: result.cheapestTitle,
                        timestamp: Date.now()
                    }]);
                    return;
                }

                if (!result || !result.success) {
                    window.electronAPI?.positionShow?.();
                    window.electronAPI?.positionCenter?.();
                    setMessages(prev => [...prev, {
                        role: "buddy",
                        text: result?.error || "No products found. Try again.",
                        timestamp: Date.now()
                    }]);
                    return;
                }

                // SHOW PRODUCTS (Buddy stays hidden while the first product auto-scrolls)
                setMessages(prev => [
                    ...prev,
                    {
                        role: "product-selection",
                        items: (result.products || []).slice(0, 5).map(p => ({
                            title: p.title   || 'Unknown product',
                            price: p.price   || 'N/A',
                            image: p.image   || null,
                            rating: p.rating || null,
                            url:   p.url     || null,
                        })),
                        currentIndex: 0,
                        _browserScrolled: false,
                        timestamp: Date.now()
                    }
                ]);
                return;
            }

            // Not logged in — open Amazon and show login card
            await window.buddyAgent.checkoutStep({ type: "amazon_start" });
            
            setMessages(prev => [
                ...prev,
                {
                    role: "await-login",
                    timestamp: Date.now()
                }
            ]);

        } catch (err) {
            window.electronAPI?.positionShow?.();
            window.electronAPI?.positionCenter?.();
            console.error(err);
        }
    };

    const handleManualLoginDetected = async () => {
        try {
            console.log("✅ MANUAL LOGIN CONFIRMED — verifying...");

            // Hide Buddy during verification check and subsequent search!
            window.electronAPI?.positionHide?.();

            if (!currentAction) {
                window.electronAPI?.positionShow?.();
                window.electronAPI?.positionCenter?.();
                setMessages(prev => [...prev, {
                    role: "buddy",
                    text: "⚠️ No action stored. Please start over.",
                    timestamp: Date.now()
                }]);
                return;
            }

            // STEP 1: Verify login is actually complete — do NOT proceed blindly
            const loginCheck = await window.buddyAgent.checkoutStep({
                type: "amazon_poll_login"
            });

            console.log("LOGIN CHECK:", loginCheck);

            if (!loginCheck || !loginCheck.isLoggedIn) {
                // Stay on login step — show message + keep await-login button
                window.electronAPI?.positionShow?.();
                window.electronAPI?.positionCenter?.();
                setMessages(prev => [
                    ...prev.filter(m => m.role !== "await-login"),
                    {
                        role: "buddy",
                        text: "⚠️ Not logged in yet. Please complete login in the browser, then click confirm again.",
                        timestamp: Date.now()
                    },
                    { role: "await-login", timestamp: Date.now() }
                ]);
                return;
            }

            // STEP 2: Login confirmed — run real search
            setMessages(prev => [
                ...prev.filter(m => m.role !== "await-login"),
                {
                    role: "buddy",
                    text: `🔍 Searching Amazon for "${currentAction.query}"...`,
                    timestamp: Date.now()
                }
            ]);

            const result = await window.buddyAgent.checkoutStep({
                type: "amazon_search",
                query: currentAction.query || "product",
                budget: currentAction.budget || null
            });

            console.log("SEARCH RESULT:", result);

            if (result?.budgetExceeded) {
                window.electronAPI?.positionShow?.();
                window.electronAPI?.positionCenter?.();
                setMessages(prev => [...prev, {
                    role: 'rebudget',
                    action: currentAction,
                    originalBudget: result.originalBudget,
                    cheapestAvailable: result.cheapestAvailable,
                    cheapestTitle: currentAction.title || result.cheapestTitle,
                    timestamp: Date.now()
                }]);
                return;
            }

            if (!result || !result.success) {
                window.electronAPI?.positionShow?.();
                window.electronAPI?.positionCenter?.();
                setMessages(prev => [...prev, {
                    role: "buddy",
                    text: result?.error || "No products found. Try again.",
                    timestamp: Date.now()
                }]);
                return;
            }

            // STEP 3: Show real products
            window.electronAPI?.positionShow?.();
            window.electronAPI?.positionCenter?.();
            setMessages(prev => [...prev, {
                role: "product-selection",
                items: (result.products || []).slice(0, 5).map(p => ({
                    title: p.title   || 'Unknown product',
                    price: p.price   || 'N/A',
                    image: p.image   || null,
                    rating: p.rating || null,
                    url:   p.url     || null,
                })),
                currentIndex: 0,
                _browserScrolled: false,
                timestamp: Date.now()
            }]);

        } catch (err) {
            window.electronAPI?.positionShow?.();
            window.electronAPI?.positionCenter?.();
            console.error("handleManualLoginDetected error:", err);
            setMessages(prev => [...prev, {
                role: "buddy",
                text: "Something went wrong: " + err.message,
                timestamp: Date.now()
            }]);
        }
    };

    const handleProductSelect = async (item) => {
        try {
            setSelectedProduct({
              title: item.title,
              price: item.price,
              link: item.url || item.link,
              image: item.image,
              rating: item.rating
            });

            setMessages(prev => [...prev, {
                role: 'buddy',
                text: `🛒 Selecting: ${item.title || 'product'}...`,
                timestamp: Date.now()
            }]);
            
            await window.buddyAgent.execute({
              type: "amazon_select_product",
              product: {
                title: item.title,
                price: item.price,
                link: item.url || item.link,
                image: item.image,
                rating: item.rating
              }
            });
        } catch (err) {
            console.error('Product select failed:', err);
        }
    };

    useEffect(() => {
        messagesRef.current = messages;
        setHistory(messages);
    }, [messages]);

    useEffect(() => {
        // Mounted once; logging removed to avoid render spam.
    }, []);

    useEffect(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;
    }, []);

    useEffect(() => {
        loadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
        // Reposition window when flow changes
        const isCenterPhase = messages.some(m => [
            'product-selection',
            'pre-checkout',
            'address-required',
            'payment-select',
            'final-confirm',
            'rebudget'
        ].includes(m.role));

        if (isCenterPhase) {
            window.electronAPI?.positionCenter?.();
            window.electronAPI?.positionShow?.();
        }
    }, [messages]);

    useEffect(() => {
        if (!window.electronAPI) return;

        const handler = (_, action) => {
            console.log("📥 Agent approval received:", action);
            setMessages(prev => [...prev, {
                role: 'agent-confirm',
                action,
                timestamp: Date.now()
            }]);
            setPendingAgentAction(action);
            setChatOpen(true);
            setSidebarVisible(false);
        };

        window.electronAPI.onAgentApproval(handler);

        return () => {
            window.electronAPI.removeAgentApproval(handler);
        };
    }, []);

    useEffect(() => {
        if (!window.api) return;
        const loginReqHandler = () => {
            console.log("📥 Login required from main process");
            setMessages(prev => [...prev, {
                role: 'agent-login-request',
                timestamp: Date.now()
            }]);
            setChatOpen(true);
        };
        const addMsgHandler = (msg) => {
            setMessages(prev => [...prev, msg]);
            window.focus();
        };

        window.api.on("login-required", loginReqHandler);
        window.api.on("add-message", addMsgHandler);
        
        return () => {
            window.api.removeListener("login-required", loginReqHandler);
            window.api.removeListener("add-message", addMsgHandler);
        };
    }, []);

    const handleSplashDone = useCallback(() => {
        setShowSplash(false);
        setTimeout(() => {
            setMainVisible(true);
            setTimeout(() => inputRef.current?.focus(), 150);
        }, 80);
    }, []);



    useEffect(() => {
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const isAppCommand = useCallback((text) => {
        const lower = text.toLowerCase().trim();

        if (COMMAND_TRIGGERS.some((keyword) => lower.startsWith(keyword))) {
            return true;
        }

        return APP_KEYWORDS.some((app) => lower === app || lower === `open ${app}` || lower.includes(app));
    }, []);

    const handleChatClose = useCallback(() => {
        setChatOpen(false);
        setSidebarVisible(true);
        inputRef.current?.focus();
    }, []);

    const handleEscape = useCallback(() => {
        if (chatOpen) {
            handleChatClose();
            return;
        }

        setSidebarVisible(true);
        inputRef.current?.clear();
    }, [chatOpen, handleChatClose]);

    const handleSubmit = useCallback(async (textOverride = null) => {
        const finalText = typeof textOverride === 'string' ? textOverride.trim() : '';
        if (!finalText) return false;

        // ── PRIORITY 0: Waiting for budget reply ─────────────────────────────
        // This check MUST come before loadingRef and every other guard.
        // If we are waiting for the user to reply (budget step), intercept the
        // input here, resolve the promise, and bail out immediately — never
        // falling through to any other handler.
        if (resolveUserInputRef.current) {
            const resolve = resolveUserInputRef.current;
            resolveUserInputRef.current = null;
            setIsWaitingForInput(false);
            setMessages(prev => [...prev, { role: 'user', text: finalText, timestamp: Date.now() }]);
            inputRef.current?.clear();
            resolve(finalText);
            return true;
        }

        // Normal guard — only for non-waiting submits
        if (loadingRef.current) return false;

        setChatOpen(true);
        setSidebarVisible(false);
        inputRef.current?.clear();

        const lower = finalText.toLowerCase().trim();
        const userMsg = { role: 'user', text: finalText, timestamp: Date.now() };
        if (messages.filter(m => m.role === 'user').length === 0) {
            setActiveSession({
                id: Date.now(),
                title: finalText.slice(0, 25),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }

        // ── 1. Math ──────────────────────────────────────────────────────────────
        const mathResult = evaluateMath(finalText);
        if (mathResult) {
            setMessages(prev => [...prev, userMsg]);
            addMessage(userMsg);
            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                const r = { role: 'buddy', text: mathResult, timestamp: Date.now() };
                setMessages(prev => [...prev, r]);
                addMessage(r);
            }, 300);
            return true;
        }

        // ── 2. Close/exit ─────────────────────────────────────────────────────
        const closeKeywords = ['close the app','close app','close buddy','exit','exit app','quit','quit app','shut down','goodbye buddy','bye buddy','close now'];
        if (closeKeywords.some(k => lower === k || lower.includes(k))) {
            const byeMsg = { role: 'buddy', text: "Goodbye! See you next time 👋\nPress Ctrl+Alt+B to bring me back anytime.", timestamp: Date.now() };
            setMessages(prev => [...prev, userMsg, byeMsg]);
            addMessages([userMsg, byeMsg]);
            setTimeout(() => window.electronAPI?.closeApp(), 1500);
            return true;
        }

        // ── 3. Agent commands → show agent-confirm card then STOP ───────────
        const agentAction = parseAgentCommand(finalText);

        if (agentAction) {
            console.log('STATE: idle →', agentAction);
            setCurrentAction(agentAction);
            setAgentStep('idle');
            setSidebarVisible(false);
            setChatOpen(true);

            setMessages(prev => [
                ...prev,
                {
                    role: 'user',
                    text: finalText,
                    timestamp: Date.now()
                },
                {
                    role: 'agent-confirm',
                    action: agentAction,
                    timestamp: Date.now()
                }
            ]);

            return true; // 🚨 STOP FLOW HERE — AgentConfirmCard handles everything next
        }

        const agentKeywords = ['order', 'buy', 'zomato', 'swiggy', 'amazon', 'flipkart', 'uber', 'ola', 'bookmyshow'];
        const isAgentCmd = agentKeywords.some(w => lower.includes(w))
            || (lower.includes('book') && (lower.includes('cab') || lower.includes('movie') || lower.includes('ticket')));

        if (isAgentCmd) {
            setMessages(prev => [...prev, userMsg]);
            addMessage(userMsg);
            // Send to backend — backend detects intent, sends agent-approval IPC back
            window.electronAPI?.sendBuddyCommand(finalText);
            return true;
        }

        // ── 4. App launcher commands → backend ───────────────────────────────
        if (isAppCommand(finalText)) {
            setMessages(prev => [...prev, userMsg]);
            addMessage(userMsg);
            window.electronAPI?.sendBuddyCommand(finalText);
            return true;
        }

        // ── 5. Local responses ────────────────────────────────────────────────
        const localResponse = getLocalResponse(finalText, lastUsedResponsesRef);
        if (localResponse) {
            setMessages(prev => [...prev, userMsg]);
            addMessage(userMsg);
            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                const r = { role: 'buddy', text: localResponse, timestamp: Date.now() };
                setMessages(prev => [...prev, r]);
                addMessage(r);
            }, 600 + Math.random() * 400);
            return true;
        }

        // ── 6. Gemini AI ─────────────────────────────────────────────────────
        const updatedMessages = [...messagesRef.current, userMsg];
        setMessages(updatedMessages);
        addMessage(userMsg);
        setIsLoading(true);

        try {
            const history = updatedMessages
                .slice(0, -1)
                .map((message) => ({
                    role: message.role === 'user' ? 'user' : 'model',
                    parts: [{ text: message.text }]
                }))
                .filter((message) => message.parts[0].text);

            const response = await window.buddyAPI.askBuddy(finalText, history);
            const buddyMessage = { role: 'buddy', text: response, timestamp: Date.now() };
            setMessages((prev) => [...prev, buddyMessage]);
            addMessage(buddyMessage);
        } catch (err) {
            console.error(err);
            const fallbackMessage = { role: 'buddy', text: `AI unavailable (Ollama). Error: ${err.message}`, timestamp: Date.now() };
            setMessages((prev) => [...prev, fallbackMessage]);
            addMessage(fallbackMessage);
        } finally {
            setIsLoading(false);
        }

        return true;
    }, [isAppCommand]);

    // STT polling — always-on background listener
    useEffect(() => {
        console.log("[Buddy] STT polling useEffect started")
        // Notify STT that app is open
        window.buddySTT?.notifyOpen?.()

        // Check STT online status
        const checkStatus = async () => {
            try {
                const s = await window.buddySTT.getStatus()
                setSttOnline(s.status === 'online')
            } catch { setSttOnline(false) }
        }
        checkStatus()

        // Poll every 600ms
        pollRef.current = setInterval(async () => {
            try {
                const result = await window.buddySTT.getResult()

                // Wake word detected — open app (already open) and show ready state
                if (result.wake && result.status === 'wake') {
                    setIsListening(true)
                    setChatOpen(true)
                    setSidebarVisible(false)
                    setMessages(prev => {
                        // Only add wake message if last message wasn't already wake
                        const last = prev[prev.length - 1]
                        if (last?.text === "I'm listening... 🎤") return prev
                        return [...prev, {
                            role: 'buddy',
                            text: "I'm listening... 🎤",
                            timestamp: Date.now()
                        }]
                    })
                    return
                }

                if (result.status === 'success' && result.text && result.text.trim()) {
                    setIsListening(false)
                    const spokenText = result.text.trim()
                    if (inputRef.current) {
                        inputRef.current.setCommand(spokenText)
                    }
                    setTimeout(() => handleSubmit(spokenText), 100)
                } else if (result.status === 'processing') {
                    setIsListening(true)
                } else if (result.status === 'idle') {
                    setIsListening(false)
                }
            } catch { /* STT not available */ }
        }, 600)

        return () => {
            window.buddySTT?.notifyClose?.()
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [handleSubmit])

    const handleMicClick = useCallback(() => {
        setMessages(prev => [...prev, {
            role: 'buddy',
            text: '⚠️ Voice recognition is offline. Make sure the Python STT server is running.',
            timestamp: Date.now()
        }]);
        setChatOpen(true);
        setSidebarVisible(false);
    }, []);

    const spotlightStyle = useMemo(() => ({
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        opacity: mainVisible ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: mainVisible ? 'auto' : 'none'
    }), [mainVisible]);

    // Safety guard — should never be null due to useState initializer, but protects render
    if (!messages || !Array.isArray(messages)) return null;

    console.log("MESSAGES:", messages);
    return (
        <>
            <style>{`
                @keyframes bgShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes floatOrb1 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -20px) scale(1.05); }
                    66% { transform: translate(-20px, 15px) scale(0.97); }
                }
                @keyframes floatOrb2 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(-25px, 20px) scale(1.03); }
                    66% { transform: translate(20px, -15px) scale(0.98); }
                }
                .orb1 { animation: floatOrb1 8s ease-in-out infinite; }
                .orb2 { animation: floatOrb2 10s ease-in-out infinite; }
                @keyframes avatarPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
                    50% { box-shadow: 0 0 0 4px rgba(99,102,241,0); }
                }
                .typing-avatar {
                    animation: avatarPulse 1.4s ease-in-out infinite;
                }
                @keyframes messageIn {
                    0% { opacity: 0; transform: translateY(8px) scale(0.97); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                .message-enter {
                    animation: messageIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                @keyframes logoEntrance {
                    0% { opacity: 0; transform: scale(0.6) translateY(20px); }
                    70% { opacity: 1; transform: scale(1.06) translateY(-4px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                .buddy-logo-entrance {
                    animation: logoEntrance 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                @keyframes titleEntrance {
                    0% { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .buddy-title-entrance {
                    animation: titleEntrance 0.5s ease forwards;
                    animation-delay: 0.2s;
                    opacity: 0;
                }
                .buddy-subtitle-entrance {
                    animation: titleEntrance 0.5s ease forwards;
                    animation-delay: 0.4s;
                    opacity: 0;
                }
                .buddy-shortcut-entrance {
                    animation: titleEntrance 0.5s ease forwards;
                    animation-delay: 0.6s;
                    opacity: 0;
                }
                @keyframes borderPulse {
                    0%, 100% { 
                        box-shadow: 0 32px 80px rgba(0,0,0,0.65), 
                                    inset 0 1px 0 rgba(255,255,255,0.06), 
                                    0 0 0 0.5px rgba(59,130,246,0.2), 
                                    0 0 20px rgba(59,130,246,0.06);
                    }
                    50% { 
                        box-shadow: 0 32px 80px rgba(0,0,0,0.65), 
                                    inset 0 1px 0 rgba(255,255,255,0.06), 
                                    0 0 0 0.5px rgba(99,102,241,0.5), 
                                    0 0 30px rgba(99,102,241,0.12);
                    }
                }
                .buddy-input-bar {
                    animation: borderPulse 3s ease-in-out infinite;
                }
                @keyframes glowPulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.7; }
                }
                .buddy-glow {
                    animation: glowPulse 3s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 0.6; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.15); }
                }
            `}</style>
            {showSplash && <WelcomeSplash onDone={handleSplashDone} />}
            <Sidebar visible={sidebarVisible && mainVisible} />
            <LeftSidebar
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                sessions={chatSessions || []}
                activeSession={activeSession}
                onSelect={(s) => { setMessages(Array.isArray(s?.messages) ? s.messages : []); setActiveSession(s); setChatOpen(true); setIsHistoryOpen(false); }}
                onNew={() => {
                    if ((messages || []).length > 0) {
                        const session = {
                            id: Date.now(),
                            title: (messages || []).find(m => m?.role === 'user')?.text?.slice(0, 25) || 'Chat',
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            messages: [...(messages || [])]
                        };
                        setChatSessions(prev => [session, ...prev].slice(0, 20));
                    }
                    setMessages([]);
                    setChatOpen(false);
                    setActiveSession(null);
                    setSidebarVisible(true);
                    setIsHistoryOpen(false);
                }}
            />

            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4" style={{
                ...spotlightStyle,
                opacity: mainVisible ? 1 : 0,
                pointerEvents: mainVisible ? 'auto' : 'none',
                transition: 'opacity 0.6s ease'
            }}>
                {/* Ambient background orbs */}
                <div className="orb1" style={{
                    position: 'absolute', width: 400, height: 400,
                    borderRadius: '50%', pointerEvents: 'none',
                    background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
                    top: '20%', left: '30%', transform: 'translate(-50%, -50%)'
                }} />
                <div className="orb2" style={{
                    position: 'absolute', width: 350, height: 350,
                    borderRadius: '50%', pointerEvents: 'none',
                    background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
                    bottom: '20%', right: '30%', transform: 'translate(50%, 50%)'
                }} />
                <div style={{ position: 'relative', width: '100%', maxWidth: 580, display: 'flex', flexDirection: 'column' }}>
                    <div className="buddy-glow" style={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: 24,
                        pointerEvents: 'none',
                        zIndex: -1,
                        boxShadow: '0 0 80px rgba(59,130,246,0.12), 0 0 160px rgba(99,102,241,0.06)',
                        background: 'transparent'
                    }} />
                    <div className="w-full flex flex-col">
                        <ChatHeader onToggleSidebar={() => setIsHistoryOpen(prev => !prev)} />
                        <ChatPanel chatEndRef={chatEndRef} chatOpen={chatOpen} isLoading={isLoading} isTyping={isTyping} messages={messages || []} onClose={handleChatClose} setMessages={setMessages} setChatOpen={setChatOpen} setSidebarVisible={setSidebarVisible} setPendingAgentAction={setPendingAgentAction} setCurrentAction={setCurrentAction} setAgentStep={setAgentStep} handleApprove={handleApprove} handleManualLoginDetected={handleManualLoginDetected} />
                        {(messages || []).length === 0 && !chatOpen && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', padding: '28px 20px', gap: 8
                            }}>
                                <p style={{ color: 'rgba(255,255,255,0.12)', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
                                    Ask me anything, open apps,<br />or search the web
                                </p>
                                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {['Open Chrome', 'Search YouTube', 'Tell me a joke'].map(s => (
                                        <button key={s} onClick={() => { inputRef.current?.setCommand(s); inputRef.current?.focus(); }}
                                            style={{
                                                padding: '4px 10px', borderRadius: 100, fontSize: 11,
                                                background: 'rgba(99,102,241,0.08)',
                                                border: '0.5px solid rgba(99,102,241,0.25)',
                                                color: 'rgba(167,139,250,0.8)', cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <InputBar 
                            chatOpen={chatOpen} 
                            inputRef={inputRef} 
                            isLoading={isLoading} 
                            isListening={isListening} 
                            sttOnline={sttOnline} 
                            onEscape={handleEscape} 
                            onSubmit={handleSubmit} 
                            onMicClick={handleMicClick} 
                        />

                        <p className="text-center mt-3" style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12, letterSpacing: '0.02em' }}>
                            Press <kbd style={{ fontFamily: 'monospace' }}>Esc</kbd> to close chat | <kbd style={{ fontFamily: 'monospace' }}>Ctrl+Alt+B</kbd> to toggle
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
});

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[Buddy] React crash:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                    <p style={{ fontSize: 14, marginBottom: 8 }}>⚠️ Something went wrong</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>{this.state.error?.message}</p>
                    <button onClick={() => this.setState({ hasError: false, error: null })}
                        style={{ padding: '6px 16px', borderRadius: 8, background: 'rgba(99,102,241,0.2)', border: '0.5px solid rgba(99,102,241,0.3)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12 }}>
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const SpotlightWithBoundary = (props) => (
    <ErrorBoundary>
        <Spotlight {...props} />
    </ErrorBoundary>
);

export default SpotlightWithBoundary;