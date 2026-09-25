import { Mic, Send, Sparkles, ChevronDown, X, Settings, Menu, Plus, MessageSquare } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import CommandInput from '../onboarding/CommandInput';
import { addMessage, addMessages, getHistory, setHistory } from '../../state/chatStore';
import { detectMarketPriceRange } from '../../utils/marketPriceRange';

// UI Primitives & Icons
import AppWindow from '../../components/ui/window/AppWindow';
import TitleBar from '../../components/ui/window/TitleBar';
import GlassCard from '../../components/ui/cards/GlassCard';
import ProductPreview from '../../components/ui/cards/ProductPreview';
import Panel from '../../components/ui/cards/Panel';
import EmptyState from '../../components/ui/cards/EmptyState';
import PrimaryButton from '../../components/ui/buttons/PrimaryButton';
import SecondaryButton from '../../components/ui/buttons/SecondaryButton';
import GhostButton from '../../components/ui/buttons/GhostButton';
import DangerButton from '../../components/ui/buttons/DangerButton';
import StatusBadge from '../../components/ui/badges/StatusBadge';
import InputField from '../../components/ui/inputs/InputField';
import MessageBubble from '../../components/ui/chat/MessageBubble';
import { BuddyIcon, PackageIcon, PaymentIcon, SettingsIcon, SuccessIcon, WarningIcon } from '../../components/ui/icons';

// Hooks & Layouts
import useWindowControls from '../../hooks/useWindowControls';
import useBuddyState from '../../hooks/useBuddyState';
import DesktopLayout from '../../layouts/DesktopLayout';
import ChatLayout from '../../layouts/ChatLayout';
import SettingsLayout from '../../layouts/SettingsLayout';

// Constants & Playground
import { PLATFORMS } from '../../constants/platforms';
import { MODELS } from '../../constants/models';
import Playground from '../onboarding/Playground';

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

// Mouse tracking removed for performance — replaced with CSS hover animations

const glassCard = {
    background: 'linear-gradient(135deg, rgba(20, 24, 33, 0.6) 0%, rgba(11, 13, 18, 0.8) 100%)',
    border: 'var(--glass-border-light)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.1)'
};


const BuddyLogo = React.memo(({ size = 'sm', state = 'idle' }) => {
    const dim = size === 'lg' ? 64 : size === 'md' ? 40 : 24;
    const iconSize = size === 'lg' ? 22 : size === 'md' ? 14 : 10;
    const ringDim = size === 'lg' ? 80 : size === 'md' ? 52 : 28;

    return (
        <div 
            className={`buddy-orb-container state-${state}`} 
            style={{ width: ringDim, height: ringDim }}

        >
            <div className="buddy-orb-ripple" />
            <div className="buddy-orb-sphere" style={{ width: dim, height: dim }}>
                <div className="buddy-orb-sheen" />
                <div className="buddy-orb-light" />
                <div className="buddy-orb-light-secondary" />
                <div style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={iconSize} style={{ color: 'rgba(255, 255, 255, 0.95)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
                </div>
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
                background: 'linear-gradient(135deg, rgba(20, 24, 33, 0.7) 0%, rgba(11, 13, 18, 0.85) 100%)',
                backdropFilter: 'blur(20px) saturate(150%)',
                WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 18,
                padding: '16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.15), 0 14px 36px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)'
            }}
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 8px #34d399, 0 0 16px #34d399', animation: 'pulse 1.8s infinite' }} />
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em' }}>ONLINE</span>
            </div>
            <p style={{ color: '#ffffff', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hey, I&apos;m Buddy</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 1.6, marginBottom: 14 }}>Your personal AI assistant - always one shortcut away.</p>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>TRY SAYING</p>
            {SIDEBAR_SUGGESTIONS.map((text) => (
                <div key={text} className="flex items-center gap-2 mb-2" style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    transition: 'all 0.25s ease'
                }}>
                    <span style={{ color: 'rgba(167,139,250,0.8)', fontSize: 10, flexShrink: 0 }}>✦</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
                </div>
            ))}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
            <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.02em' }}>qwen3.5:2b (Local)</p>
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
            background: 'radial-gradient(circle at center, rgba(20,18,36,0.96) 0%, rgba(8,7,16,0.99) 100%)',
            transition: 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: phase === 'dissolve' ? 0 : 1,
            transform: phase === 'dissolve' ? 'scale(0.97)' : 'scale(1)',
            pointerEvents: phase === 'dissolve' ? 'none' : 'auto',
            backdropFilter: 'blur(var(--glass-blur-main))',
            WebkitBackdropFilter: 'blur(var(--glass-blur-main))'
        }}>
            {/* Ambient colorful backdrop glow */}
            <div style={{
                position: 'absolute', width: 320, height: 320, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
                filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0
            }} />
            <div style={{
                position: 'absolute', width: 280, height: 280, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
                filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0,
                transform: 'translate(40px, -40px)'
            }} />

            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
                transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                opacity: phase === 'enter' ? 0 : 1,
                transform: phase === 'enter' ? 'translateY(16px)' : 'translateY(0)',
                zIndex: 1
            }}>
                <BuddyLogo size="lg" state="thinking" />
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ color: '#ffffff', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, textShadow: '0 2px 10px rgba(99,102,241,0.2)' }}>Buddy</h1>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 8, fontWeight: 400, letterSpacing: '0.02em' }}>Your personal AI assistant</p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '8px 20px', borderRadius: 100,
                    background: 'rgba(255,255,255,0.03)',
                    border: 'var(--glass-border-light)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(var(--glass-blur-passive))',
                    WebkitBackdropFilter: 'blur(var(--glass-blur-passive))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.8)' }} />
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 }}>Ready</span>
                    </div>
                    <div style={{ width: '1px', height: 12, background: 'rgba(255,255,255,0.1)' }} />
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.05em' }}>Ctrl+Alt+B</span>
                </div>
            </div>
        </div>
    );
});

const ChatHeader = React.memo(({ onToggleSidebar, settingsOpen, setSettingsOpen }) => {
    const handleClose = useCallback(() => {
        if (window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
            window.electronAPI.closeApp();
        }
    }, []);

    const handleMinimize = useCallback(() => {
        if (window.electronAPI && typeof window.electronAPI.minimizeWindow === 'function') {
            window.electronAPI.minimizeWindow();
        }
    }, []);

    const handleMaximize = useCallback(() => {
        if (window.electronAPI && typeof window.electronAPI.toggleMaximizeWindow === 'function') {
            window.electronAPI.toggleMaximizeWindow();
        }
    }, []);

    return (
        <div
            className="relative w-full"
            style={{
                ...glassCard,
                borderRadius: '20px 20px 0 0',
                padding: '14px 20px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                WebkitAppRegion: 'drag',
                userSelect: 'none'
            }}
        >
            <div className="flex items-center justify-between w-full">
                {/* Left controls: menu toggle + branding logo */}
                <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
                    <button
                        onClick={onToggleSidebar}
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.6)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 6,
                            borderRadius: '50%',
                            transition: 'all 0.2s ease',
                            zIndex: 110
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                            e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                            e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                        }}
                    >
                        <Menu size={14} />
                    </button>

                    <div className="flex items-center gap-2" style={{ fontWeight: 600, letterSpacing: '0.12em', fontSize: 11 }}>
                        <BuddyLogo size="xs" state="idle" />
                        <span style={{
                            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            fontWeight: 700
                        }}>BUDDY</span>
                    </div>

                    <div style={{
                        padding: '2px 8px', borderRadius: 100, fontSize: 9,
                        background: 'rgba(109, 125, 255, 0.1)',
                        border: '0.5px solid rgba(109, 125, 255, 0.25)',
                        color: 'rgba(167, 139, 250, 0.85)',
                        fontWeight: 600
                    }}>Gemini 2.5 Flash</div>
                </div>

                {/* Right controls: settings toggle + window controls */}
                <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' }}>
                    {/* Settings button */}
                    <button
                        onClick={() => setSettingsOpen(prev => !prev)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: settingsOpen ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.45)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'color 0.2s ease',
                            padding: 4
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                        onMouseLeave={e => e.currentTarget.style.color = settingsOpen ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.45)'}
                    >
                        <Settings size={14} />
                    </button>

                    {/* Window traffic lights */}
                    <div className="flex items-center gap-1.5" style={{ paddingLeft: 4 }}>
                        <div 
                            onClick={handleMinimize}
                            style={{
                                width: 11, height: 11, borderRadius: '50%',
                                background: '#f5c453',
                                opacity: 0.85,
                                cursor: 'pointer',
                                transition: 'opacity 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = 0.85}
                        />
                        <div 
                            onClick={handleMaximize}
                            style={{
                                width: 11, height: 11, borderRadius: '50%',
                                background: '#2dd4bf',
                                opacity: 0.85,
                                cursor: 'pointer',
                                transition: 'opacity 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = 0.85}
                        />
                        <div 
                            onClick={handleClose}
                            style={{
                                width: 11, height: 11, borderRadius: '50%',
                                background: '#ff6b6b',
                                opacity: 0.85,
                                cursor: 'pointer',
                                transition: 'opacity 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = 0.85}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

// Rebudget card — shown when no product falls within the original budget

const PaymentOptionsCard = React.memo(({ platform, onSelect, onCancel }) => {
    const [selected, setSelected] = useState(null);
    const [upiId, setUpiId] = useState('');

    const paymentMethods = [
        { id: 'cod', label: 'Cash on Delivery', desc: 'Pay when your order arrives' },
        { id: 'upi', label: 'UPI', desc: 'GPay, PhonePe, Paytm' },
        { id: 'card', label: 'Credit / Debit Card', desc: 'Visa, Mastercard, Rupay' },
        { id: 'netbanking', label: 'Net Banking', desc: 'All major banks supported' },
        { id: 'amazonpay', label: 'Amazon Pay', desc: 'Use your Amazon Pay balance' },
    ];

    return (
        <MessageBubble role="buddy">
            <Panel
                title="Choose Payment Option"
                subtitle="Select Payment Method"
                status={<StatusBadge type="primary">{platform}</StatusBadge>}
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {paymentMethods.map(method => (
                                <div
                                    key={method.id}
                                    onClick={() => setSelected(method.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '9px 12px', borderRadius: 'var(--win-radius-button)', cursor: 'pointer',
                                        background: selected === method.id ? 'rgba(111, 124, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${selected === method.id ? 'rgba(111, 124, 255, 0.35)' : 'var(--win-border-light)'}`,
                                        transition: 'all var(--win-timing-hover) ease'
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <p style={{ color: selected === method.id ? '#ffffff' : 'var(--win-text-secondary)', fontSize: 'var(--win-size-body)', fontWeight: 500, margin: 0 }}>{method.label}</p>
                                        <p style={{ color: 'var(--win-text-caption)', fontSize: 'var(--win-size-caption)', margin: 0 }}>{method.desc}</p>
                                    </div>
                                    <div style={{
                                        width: '14px', height: '14px', borderRadius: '50%',
                                        border: `1.5px solid ${selected === method.id ? 'var(--win-accent)' : 'rgba(255,255,255,0.25)'}`,
                                        background: selected === method.id ? 'var(--win-accent)' : 'transparent',
                                        transition: 'all var(--win-timing-hover) ease', flexShrink: 0
                                    }} />
                                </div>
                            ))}
                        </div>
                        {selected === 'upi' && (
                            <InputField
                                type="text"
                                value={upiId}
                                onChange={e => setUpiId(e.target.value)}
                                onKeyDown={e => e.stopPropagation()}
                                placeholder="Enter UPI ID (e.g. name@upi)"
                            />
                        )}
                    </div>
                }
                actions={
                    <>
                        <PrimaryButton 
                            onClick={() => onSelect({ method: selected, upiId: selected === 'upi' ? upiId : undefined })} 
                            disabled={!selected || (selected === 'upi' && !upiId)}
                            style={{ flex: 1.2 }}
                        >
                            Continue
                        </PrimaryButton>
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
            />
        </MessageBubble>
    );
});

// ── Purchase Review & Customer Approval Card (Increment 2B-3) ────────────────
const AgentPurchaseReviewCard = React.memo(({ sessionId, safeReview, onApproved, onCancelled }) => {
    // Renderer State Machine: 'AWAITING_CUSTOMER_APPROVAL' | 'APPROVAL_PENDING' | 'PURCHASE_APPROVED' | 'APPROVAL_FAILED' | 'CANCELLED'
    const [uiState, setUiState] = useState('AWAITING_CUSTOMER_APPROVAL');
    const [errorMessage, setErrorMessage] = useState('');
    const isSubmittingRef = useRef(false);

    // Presentation-only formatting. Does NOT compute or alter financial authority.
    const formatPaise = (paise, curr = '₹') => {
        if (typeof paise !== 'number') return `${curr}0.00`;
        return `${curr}${(paise / 100).toFixed(2)}`;
    };

    const handleApprove = async () => {
        // Concurrency / double-click protection: ignore duplicate clicks while pending or after approval
        if (isSubmittingRef.current || uiState === 'APPROVAL_PENDING' || uiState === 'PURCHASE_APPROVED') {
            return;
        }
        isSubmittingRef.current = true;
        setUiState('APPROVAL_PENDING');

        try {
            // ZERO-TRUST IPC: Send strictly sessionId and snapshotId. Never send financial figures, tokens, or checksums!
            const approvalPayload = {
                sessionId,
                snapshotId: safeReview?.snapshotId
            };

            let result;
            if (window.buddyAgent?.approvePurchase) {
                result = await window.buddyAgent.approvePurchase(approvalPayload);
            } else {
                throw new Error('NO_APPROVAL_API_AVAILABLE');
            }

            if (result && result.success && (result.approved || result.state === 'PURCHASE_APPROVED')) {
                setUiState('PURCHASE_APPROVED');
                if (onApproved) onApproved(result);
            } else {
                isSubmittingRef.current = false;
                setUiState('APPROVAL_FAILED');
                setErrorMessage(result?.reason || result?.error || 'Approval rejected by backend safety');
            }
        } catch (err) {
            isSubmittingRef.current = false;
            setUiState('APPROVAL_FAILED');
            setErrorMessage(err.message || 'Approval request failed');
        }
    };

    const handleCancel = async () => {
        if (isSubmittingRef.current && uiState === 'APPROVAL_PENDING') return;
        setUiState('CANCELLED');
        try {
            if (window.buddyAgent?.cancelCheckout) {
                await window.buddyAgent.cancelCheckout({ sessionId });
            } else if (window.buddyAgent?.checkoutStep) {
                await window.buddyAgent.checkoutStep({
                    type: 'amazon_cancel_checkout',
                    sessionId
                });
            }
        } catch { }
        if (onCancelled) onCancelled();
    };

    if (!safeReview) {
        return (
            <MessageBubble role="buddy">
                <Panel
                    title="Review Unavailable"
                    subtitle="Order details could not be loaded safely"
                    status={<StatusBadge type="danger">Error</StatusBadge>}
                    content={<p style={{ color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-body)' }}>Missing review snapshot.</p>}
                    actions={<SecondaryButton onClick={handleCancel} style={{ flex: 1 }}>Dismiss</SecondaryButton>}
                />
            </MessageBubble>
        );
    }

    const isPending = uiState === 'APPROVAL_PENDING';
    const isApproved = uiState === 'PURCHASE_APPROVED';
    const isFailed = uiState === 'APPROVAL_FAILED';
    const isCancelled = uiState === 'CANCELLED';

    // Authoritative total is read strictly from backend-provided safeReview
    const displayTotal = formatPaise(safeReview.totalPayablePaise);

    return (
        <MessageBubble role="buddy">
            <Panel
                title="Purchase Review & Approval"
                subtitle="Review order details before authorizing purchase"
                status={
                    isApproved ? <StatusBadge type="success">Approved</StatusBadge>
                    : isFailed ? <StatusBadge type="danger">Failed</StatusBadge>
                    : isCancelled ? <StatusBadge type="warning">Cancelled</StatusBadge>
                    : isPending ? <StatusBadge type="primary">Authorizing...</StatusBadge>
                    : <StatusBadge type="primary">Review</StatusBadge>
                }
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Target Product */}
                        <div style={{
                            padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                            background: 'rgba(255,255,255,0.02)', border: 'var(--win-border-light)'
                        }}>
                            <p style={{ color: '#ffffff', fontSize: 'var(--win-size-body)', fontWeight: 600, margin: '0 0 4px 0', lineHeight: 1.4 }}>
                                {safeReview.title || 'Target Product'}
                            </p>
                            {safeReview.variant && (
                                <p style={{ color: 'var(--win-text-caption)', fontSize: 'var(--win-size-caption)', margin: '0 0 4px 0' }}>
                                    Variant: {safeReview.variant}
                                </p>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-caption)', marginTop: 4 }}>
                                <span>ASIN: {safeReview.targetAsin || safeReview.extractedAsin}</span>
                                <span>Qty: {safeReview.quantity || 1}</span>
                            </div>
                        </div>

                        {/* Financial Breakdown (presentation only — values come directly from backend) */}
                        <div style={{
                            padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                            background: 'rgba(255,255,255,0.015)', border: 'var(--win-border-light)',
                            display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--win-size-supporting)' }}>
                                <span style={{ color: 'var(--win-text-secondary)' }}>Item Price</span>
                                <span style={{ color: '#fff' }}>{formatPaise(safeReview.itemPricePaise)}</span>
                            </div>
                            {typeof safeReview.shippingPricePaise === 'number' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--win-size-supporting)' }}>
                                    <span style={{ color: 'var(--win-text-secondary)' }}>Delivery / Shipping</span>
                                    <span style={{ color: safeReview.shippingPricePaise === 0 ? 'var(--win-success)' : '#fff' }}>
                                        {safeReview.shippingPricePaise === 0 ? 'FREE' : formatPaise(safeReview.shippingPricePaise)}
                                    </span>
                                </div>
                            )}
                            {safeReview.taxPricePaise ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--win-size-supporting)' }}>
                                    <span style={{ color: 'var(--win-text-secondary)' }}>Estimated Tax</span>
                                    <span style={{ color: '#fff' }}>{formatPaise(safeReview.taxPricePaise)}</span>
                                </div>
                            ) : null}
                            {safeReview.discountPaise ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--win-size-supporting)' }}>
                                    <span style={{ color: 'var(--win-success)' }}>Discount</span>
                                    <span style={{ color: 'var(--win-success)' }}>-{formatPaise(safeReview.discountPaise)}</span>
                                </div>
                            ) : null}
                            {(safeReview.codFeePaise || safeReview.platformFeePaise) ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--win-size-supporting)' }}>
                                    <span style={{ color: 'var(--win-text-secondary)' }}>Fees</span>
                                    <span style={{ color: '#fff' }}>{formatPaise((safeReview.codFeePaise || 0) + (safeReview.platformFeePaise || 0))}</span>
                                </div>
                            ) : null}

                            <div style={{ height: '1px', background: 'var(--win-border-light)', margin: '4px 0' }} />

                            {/* Authoritative Order Total */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--win-size-body)', fontWeight: 600 }}>
                                <span style={{ color: '#fff' }}>Order Total</span>
                                <span style={{ color: 'var(--win-accent-light, #818cf8)' }}>{displayTotal}</span>
                            </div>
                        </div>

                        {/* Delivery & Payment Summaries */}
                        {(safeReview.deliveryAddressSummary || safeReview.paymentMethodSummary) && (
                            <div style={{
                                padding: '8px 12px', borderRadius: 'var(--win-radius-button)',
                                background: 'rgba(255,255,255,0.015)', border: 'var(--win-border-light)',
                                fontSize: 'var(--win-size-caption)', color: 'var(--win-text-secondary)',
                                display: 'flex', flexDirection: 'column', gap: '2px'
                            }}>
                                {safeReview.deliveryAddressSummary && (
                                    <div><strong>Deliver to:</strong> {safeReview.deliveryAddressSummary}</div>
                                )}
                                {safeReview.paymentMethodSummary && (
                                    <div><strong>Payment:</strong> {safeReview.paymentMethodSummary}</div>
                                )}
                            </div>
                        )}

                        {/* Status Notices */}
                        {isApproved && (
                            <div style={{
                                padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                                background: 'rgba(50, 213, 131, 0.08)', border: '1px solid rgba(50, 213, 131, 0.25)',
                                color: 'var(--win-success)', fontSize: 'var(--win-size-supporting)', fontWeight: 500
                            }}>
                                ✅ Purchase approved. Order submission remains held at pre-dispatch safety boundary.
                            </div>
                        )}
                        {isFailed && (
                            <div style={{
                                padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#f87171', fontSize: 'var(--win-size-supporting)', fontWeight: 500
                            }}>
                                ⚠️ Approval rejected: {errorMessage || 'Validation failed closed'}
                            </div>
                        )}
                        {isCancelled && (
                            <div style={{
                                padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                                background: 'rgba(255,255,255,0.03)', border: 'var(--win-border-light)',
                                color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-supporting)'
                            }}>
                                ❌ Purchase cancelled by user.
                            </div>
                        )}
                    </div>
                }
                actions={
                    !isApproved && !isCancelled ? (
                        <>
                            <PrimaryButton
                                onClick={handleApprove}
                                disabled={isPending || isApproved}
                                style={{ flex: 1.2 }}
                            >
                                {isPending ? 'Authorizing...' : 'Approve Purchase'}
                            </PrimaryButton>
                            <SecondaryButton
                                onClick={handleCancel}
                                disabled={isPending}
                                style={{ flex: 0.8 }}
                            >
                                Cancel
                            </SecondaryButton>
                        </>
                    ) : (
                        <SecondaryButton onClick={handleCancel} style={{ flex: 1 }}>Close</SecondaryButton>
                    )
                }
            />
        </MessageBubble>
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
        <MessageBubble role="buddy">
            <Panel
                title="Delivery Address Required"
                subtitle="Buddy will detect it automatically once you add it"
                status={<StatusBadge type="warning">{platform}</StatusBadge>}
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{
                            padding: '10px 12px', borderRadius: 'var(--win-radius-card)',
                            background: 'rgba(255,255,255,0.015)',
                            border: 'var(--win-border-light)'
                        }}>
                            {[
                                '1. Look at the browser window that just opened',
                                '2. Add or select your delivery address there',
                                '3. Buddy will automatically detect when it\'s done',
                                '4. Payment will be selected and order confirmed here'
                            ].map((step, idx) => (
                                <p key={idx} style={{ color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-supporting)', margin: '0 0 6px 0', lineHeight: 1.5 }}>{step}</p>
                            ))}
                        </div>
                        {polling && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                                background: 'rgba(50, 213, 131, 0.08)',
                                border: '1px solid rgba(50, 213, 131, 0.25)'
                            }}>
                                <div style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: 'var(--win-success)',
                                    boxShadow: '0 0 6px var(--win-success)',
                                    animation: 'pulse 1.5s infinite',
                                    flexShrink: 0
                                }} />
                                <p style={{ color: 'var(--win-success)', fontSize: 'var(--win-size-supporting)', margin: 0, fontWeight: 500 }}>
                                    Watching for address... Add it in the browser now
                                </p>
                            </div>
                        )}
                    </div>
                }
                actions={
                    <>
                        {!polling && !detected && (
                            <PrimaryButton onClick={startPolling} style={{ flex: 1.2 }}>Watch for Address</PrimaryButton>
                        )}
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
            />
        </MessageBubble>
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
        <MessageBubble role="buddy">
            <Panel
                title={isFirstLogin ? `Sign in to ${platform} to continue` : `Sign in to complete checkout`}
                subtitle={isFirstLogin ? 'Log in to Amazon in the browser - Buddy will detect it automatically' : 'Login required to proceed with payment'}
                status={<StatusBadge type="danger">{platform}</StatusBadge>}
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{
                            padding: '10px 12px', borderRadius: 'var(--win-radius-card)',
                            background: 'rgba(255,255,255,0.015)',
                            border: 'var(--win-border-light)'
                        }}>
                            {[
                                '1. Look at the browser window that just opened',
                                '2. Enter your login credentials there',
                                '3. Buddy will automatically detect when you\'re logged in',
                                '4. Payment will be selected and order confirmed here'
                            ].map((step, idx) => (
                                <p key={idx} style={{ color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-supporting)', margin: '0 0 6px 0', lineHeight: 1.5 }}>{step}</p>
                            ))}
                        </div>
                        {polling && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 12px', borderRadius: 'var(--win-radius-button)',
                                background: 'rgba(50, 213, 131, 0.08)',
                                border: '1px solid rgba(50, 213, 131, 0.25)'
                            }}>
                                <div style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: 'var(--win-success)',
                                    boxShadow: '0 0 6px var(--win-success)',
                                    animation: 'pulse 1.5s infinite',
                                    flexShrink: 0
                                }} />
                                <p style={{ color: 'var(--win-success)', fontSize: 'var(--win-size-supporting)', margin: 0, fontWeight: 500 }}>
                                    Watching for login... Complete it in the browser now
                                </p>
                            </div>
                        )}
                    </div>
                }
                actions={
                    <>
                        {!polling && !detected && (
                            <PrimaryButton onClick={startPolling} style={{ flex: 1.2 }}>Watch for Login</PrimaryButton>
                        )}
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
            />
        </MessageBubble>
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
            <MessageBubble role="buddy">
                <GlassCard>
                    <EmptyState
                        icon={<PackageIcon size={24} />}
                        title="No more products matched your criteria"
                        action={<SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>}
                    />
                </GlassCard>
            </MessageBubble>
        );
    }

    const p = products[currentIndex];
    if (!p) return <p style={{ color: 'white' }}>Loading...</p>;

    const platformName = p.url?.includes('amazon') ? 'Amazon' : p.url?.includes('flipkart') ? 'Flipkart' : 'Store';

    return (
        <MessageBubble role="buddy">
            <Panel
                title={p.title || 'Product Title'}
                subtitle={p.brand || p.title?.split(' ')?.[0] || 'Brand'}
                status={<StatusBadge type="primary">{platformName}</StatusBadge>}
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <ProductPreview image={p.image} title={p.title} />
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '4px 0' }}>
                            <span style={{ color: 'var(--win-success)', fontSize: '18px', fontWeight: 700 }}>
                                {p.price ? (typeof p.price === 'string' && p.price.includes('₹') ? p.price : `₹${p.price}`) : 'Price unavailable'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {p.rating && (
                                <StatusBadge type="muted">
                                    ⭐ {p.rating} {p.reviews ? `(${p.reviews})` : ''}
                                </StatusBadge>
                            )}
                            <StatusBadge type="success">Prime Delivery</StatusBadge>
                        </div>
                    </div>
                }
                actions={
                    <>
                        <PrimaryButton onClick={() => onSubmit(p)} style={{ flex: 1.2 }}>Buy This</PrimaryButton>
                        {currentIndex < products.length - 1 && (
                            <SecondaryButton onClick={() => setCurrentIndex(currentIndex + 1)} style={{ flex: 0.8 }}>Next</SecondaryButton>
                        )}
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
                footer={`Option ${currentIndex + 1} of ${products.length}`}
            />
        </MessageBubble>
    );
});

const AgentPreCheckoutCard = React.memo(({ platform, onSubmit, onCancel }) => {
    return (
        <MessageBubble role="buddy">
            <Panel
                title="Confirm Purchase Order"
                subtitle="Checkout Verification"
                status={<StatusBadge type="warning">{platform}</StatusBadge>}
                content={
                    <p style={{ color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-body)', margin: 0, lineHeight: 1.5 }}>
                        The product is in your cart. Should I proceed to checkout and place the order on {platform}?
                    </p>
                }
                actions={
                    <>
                        <PrimaryButton onClick={onSubmit} style={{ flex: 1.2 }}>Yes, proceed to buy</PrimaryButton>
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>No, manually</SecondaryButton>
                    </>
                }
            />
        </MessageBubble>
    );
});

const ProductApprovalCard = React.memo(({ products, currentIndex, onApprove, onSkip, onCancel }) => {
    const safeIndex = Math.min(currentIndex || 0, (products?.length || 1) - 1);
    const product = products?.[safeIndex];
    if (!product) {
        return (
            <MessageBubble role="buddy">
                <GlassCard>
                    <EmptyState
                        icon={<PackageIcon size={24} />}
                        title="No more products to show"
                    />
                </GlassCard>
            </MessageBubble>
        );
    }

    return (
        <MessageBubble role="buddy">
            <Panel
                title={product.title}
                subtitle={product.brand || product.title?.split(' ')?.[0] || 'Brand'}
                status={<StatusBadge type="primary">Amazon</StatusBadge>}
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <ProductPreview image={product.image} title={product.title} />
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '4px 0' }}>
                            <span style={{ color: 'var(--win-success)', fontSize: '18px', fontWeight: 700 }}>
                                ₹{product.price?.toLocaleString?.()}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {product.rating && (
                                <StatusBadge type="muted">
                                    ⭐ {product.rating} {product.reviews ? `(${product.reviews})` : ''}
                                </StatusBadge>
                            )}
                            <StatusBadge type="success">Prime Delivery</StatusBadge>
                        </div>
                    </div>
                }
                actions={
                    <>
                        <PrimaryButton onClick={() => onApprove(product)} style={{ flex: 1.2 }}>Add to Cart</PrimaryButton>
                        {currentIndex < products.length - 1 && (
                            <SecondaryButton onClick={onSkip} style={{ flex: 0.8 }}>Next</SecondaryButton>
                        )}
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
                footer={`Option ${currentIndex + 1} of ${products.length}`}
            />
        </MessageBubble>
    );
});

const PreCheckoutCard = React.memo(({ platform, onConfirm, onCancel }) => {
    const [checked, setChecked] = useState([]);
    const [otherText, setOtherText] = useState('');
    const [showOther, setShowOther] = useState(false);

    const questions = [
        { id: 'return', label: 'Does this item have at least 7-day return policy?' },
        { id: 'cancel', label: 'Can I cancel this order before delivery?' },
        { id: 'warranty', label: 'Is there a warranty included?' },
        { id: 'delivery', label: 'What is the estimated delivery time?' },
        { id: 'genuine', label: 'Is this a genuine/original product?' },
        { id: 'cod', label: 'Is Cash on Delivery available for this item?' },
    ];

    const toggle = (id) => setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    return (
        <MessageBubble role="buddy">
            <Panel
                title="Order Checklist"
                subtitle="Verify details or click proceed below"
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {questions.map(q => (
                            <div key={q.id} onClick={() => toggle(q.id)} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                borderRadius: 'var(--win-radius-button)', cursor: 'pointer',
                                background: checked.includes(q.id) ? 'rgba(111, 124, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${checked.includes(q.id) ? 'rgba(111, 124, 255, 0.35)' : 'var(--win-border-light)'}`,
                                transition: 'all var(--win-timing-hover) ease'
                            }}>
                                <div style={{
                                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                                    border: `1.5px solid ${checked.includes(q.id) ? 'var(--win-accent)' : 'rgba(255,255,255,0.25)'}`,
                                    background: checked.includes(q.id) ? 'var(--win-accent)' : 'transparent',
                                    transition: 'all var(--win-timing-hover) ease',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {checked.includes(q.id) && <span style={{ color: '#ffffff', fontSize: 9, fontWeight: 'bold' }}>✓</span>}
                                </div>
                                <p style={{ color: checked.includes(q.id) ? '#ffffff' : 'var(--win-text-secondary)', fontSize: 'var(--win-size-body)', margin: 0, lineHeight: 1.45, fontWeight: checked.includes(q.id) ? 500 : 400 }}>{q.label}</p>
                            </div>
                        ))}
                        <div onClick={() => setShowOther(p => !p)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                            borderRadius: 'var(--win-radius-button)', cursor: 'pointer',
                            background: showOther ? 'rgba(111, 124, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${showOther ? 'rgba(111, 124, 255, 0.35)' : 'var(--win-border-light)'}`,
                            transition: 'all var(--win-timing-hover) ease'
                        }}>
                            <div style={{
                                width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                                border: `1.5px solid ${showOther ? 'var(--win-accent)' : 'rgba(255,255,255,0.25)'}`,
                                background: showOther ? 'var(--win-accent)' : 'transparent',
                                transition: 'all var(--win-timing-hover) ease',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {showOther && <span style={{ color: '#ffffff', fontSize: 9, fontWeight: 'bold' }}>✓</span>}
                            </div>
                            <p style={{ color: showOther ? '#ffffff' : 'var(--win-text-secondary)', fontSize: 'var(--win-size-body)', margin: 0, fontWeight: showOther ? 500 : 400 }}>Others - type your question</p>
                        </div>
                        {showOther && (
                            <InputField
                                type="text" value={otherText}
                                onChange={e => setOtherText(e.target.value)}
                                onKeyDown={e => e.stopPropagation()}
                                placeholder="Type your question..."
                            />
                        )}
                    </div>
                }
                actions={
                    <>
                        <PrimaryButton onClick={() => onConfirm({ questions: checked, other: otherText })} style={{ flex: 1.2 }}>
                            {checked.length > 0 || otherText ? 'Ask & Proceed' : 'Proceed to Checkout'}
                        </PrimaryButton>
                        <SecondaryButton onClick={onCancel} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
            />
        </MessageBubble>
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
            position: 'fixed', top: '74px', bottom: 0, left: 0, width: 260, zIndex: 100,
            background: 'linear-gradient(180deg, rgba(20, 24, 33, 0.75) 0%, rgba(11, 13, 18, 0.92) 100%)',
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            borderRight: 'var(--glass-border-light)',
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex', flexDirection: 'column',
            boxShadow: isOpen ? '2px 0 6px rgba(0,0,0,0.15), 8px 0 20px rgba(0,0,0,0.18), 16px 0 36px rgba(0,0,0,0.15)' : 'none'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)'
            }}>
                <button onClick={onClose} style={{
                    background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4,
                    transition: 'color 0.2s'
                }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                >
                    <Menu size={18} />
                </button>
                <button onClick={onNew} className="liquid-btn-secondary" style={{
                    borderRadius: 10, padding: '7px 14px', color: '#ffffff',
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 6
                }}>
                    <Plus size={14} /> New chat
                </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }} className="custom-scrollbar">
                {sessions.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        No history yet
                    </div>
                )}
                {Object.entries(grouped).map(([label, items]) => items.length > 0 && (
                    <div key={label} style={{ marginBottom: 20 }}>
                        <h4 style={{
                            margin: '0 0 10px 8px', fontSize: 11, fontWeight: 600,
                            color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase'
                        }}>{label}</h4>
                        {items.map(s => (
                            <div
                                key={s.id}
                                onClick={() => { onSelect(s); onClose(); }}
                                style={{
                                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 6,
                                    background: activeSession?.id === s.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    border: `1px solid ${activeSession?.id === s.id ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
                                    boxShadow: activeSession?.id === s.id ? 'inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
                                    transition: 'all 0.2s ease',
                                    display: 'flex', alignItems: 'center', gap: 12
                                }}
                                onMouseEnter={e => {
                                    if (activeSession?.id !== s.id) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (activeSession?.id !== s.id) {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.borderColor = 'transparent';
                                    }
                                }}
                            >
                                <MessageSquare size={14} style={{ color: activeSession?.id === s.id ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <p style={{
                                        color: activeSession?.id === s.id ? '#ffffff' : 'rgba(255,255,255,0.7)',
                                        fontSize: 13, margin: 0, fontWeight: activeSession?.id === s.id ? 500 : 400,
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
                width: 22, height: 22, borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1
            }}>
                <Sparkles size={11} style={{ color: 'rgba(167,139,250,0.95)' }} />
            </div>
            <div className="passive-glass-card" style={{ maxWidth: '88%', padding: '12px', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div>
                        <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: 0 }}>
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
                            padding: '10px 12px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.01)',
                            display: 'flex', flexDirection: 'column', gap: 6,
                            transition: 'all 0.2s ease'
                        }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                            }}
                        >
                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: 0, lineHeight: 1.4, fontWeight: 400 }}>
                                {(opt?.title || '').length > 60 ? (opt?.title || '').slice(0, 57) + '...' : (opt?.title || 'Untitled item')}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ color: '#34d399', fontSize: 13, fontWeight: 700 }}>
                                        ₹{opt.price}
                                    </span>
                                    {opt.rating > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 100, background: 'rgba(250,204,21,0.06)', border: '0.5px solid rgba(250,204,21,0.18)' }}>
                                            <svg width="9" height="9" viewBox="0 0 24 24" fill="rgba(250,204,21,0.85)" stroke="none" style={{ flexShrink: 0 }}>
                                                <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                                            </svg>
                                            <span style={{ color: 'rgba(250,204,21,0.85)', fontSize: 9, fontWeight: 600 }}>{opt.rating}</span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => onSelect(opt)}
                                    className="liquid-btn"
                                    style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500
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
                    className="liquid-btn-secondary"
                    style={{
                        width: '100%', padding: '7px 0', borderRadius: 8, fontSize: 12
                    }}
                >
                    Show more options
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
                width: 22, height: 22, borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1
            }}>
                <Sparkles size={11} style={{ color: 'rgba(239, 68, 68, 0.95)' }} />
            </div>
            <div className="passive-glass-card" style={{
                maxWidth: '88%',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                boxShadow: '0 8px 32px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '12px 14px' }}>
                    {/* Warning header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <p style={{ color: '#ffffff', fontSize: 12, fontWeight: 600, margin: 0 }}>
                            No items found within ₹{originalBudget}
                        </p>
                    </div>

                    {/* Cheapest available */}
                    {cheapestAvailable && (
                        <div style={{
                            padding: '8px 10px', borderRadius: 8, marginBottom: 12,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: '0 0 4px', letterSpacing: '0.05em', fontWeight: 600 }}>CHEAPEST AVAILABLE</p>
                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '0 0 4px', lineHeight: 1.4 }}>{cheapestTitle}</p>
                            <p style={{ color: '#34d399', fontSize: 14, fontWeight: 700, margin: 0 }}>₹{cheapestAvailable}</p>
                        </div>
                    )}

                    {/* New budget input */}
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '0 0 8px' }}>
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
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.9)', fontSize: 12,
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={() => { if (newBudget) onSubmit(newBudget); }}
                            disabled={!newBudget}
                            className="liquid-btn"
                            style={{
                                padding: '7px 14px', borderRadius: 8, fontSize: 12,
                                background: newBudget ? 'linear-gradient(135deg, rgba(239,68,68,0.45) 0%, rgba(220,38,38,0.35) 100%)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${newBudget ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.08)'}`,
                                boxShadow: newBudget ? '0 4px 12px rgba(239,68,68,0.15)' : 'none'
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

const AgentMarketRangeCard = React.memo(({ info }) => {
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        try {
            if (info) {
                console.log('[MarketPriceInsight:Interaction]', {
                    event: 'Card Viewed',
                    sessionId: info.sessionId || 'default-session',
                    category: info.categoryName,
                    userBudget: info.userBudget,
                    recommendedRange: info.formattedRange,
                    estimatedSavings: info.savingsText,
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('[MarketPriceInsight:Error]', 'Card Viewed log failed:', err.message);
        }

        return () => {
            try {
                if (info && !dismissed) {
                    console.log('[MarketPriceInsight:Interaction]', {
                        event: 'Card Auto Hidden',
                        sessionId: info.sessionId || 'default-session',
                        category: info.categoryName,
                        timestamp: Date.now()
                    });
                }
            } catch (err) {
                console.error('[MarketPriceInsight:Error]', 'Card Auto Hidden log failed:', err.message);
            }
        };
    }, [info, dismissed]);

    const handleDismiss = useCallback(() => {
        try {
            console.log('[MarketPriceInsight:Interaction]', {
                event: 'Card Dismissed',
                sessionId: info?.sessionId || 'default-session',
                category: info?.categoryName,
                timestamp: Date.now()
            });
        } catch (err) {
            console.error('[MarketPriceInsight:Error]', 'Card Dismissed log failed:', err.message);
        }
        setDismissed(true);
    }, [info]);

    if (!info || dismissed) return null;

    return (
        <div 
            className="message-enter" 
            role="region"
            aria-label="Market price range and estimated savings insight"
            tabIndex={0}
            style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start', position: 'relative' }}
        >
            <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.15))',
                border: '1px solid rgba(52,211,153,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
                boxShadow: '0 0 10px rgba(52,211,153,0.2)'
            }}>
                <Sparkles size={10} style={{ color: 'rgba(52,211,153,0.95)' }} aria-hidden="true" />
            </div>

            <div className="passive-glass-card" style={{
                maxWidth: '88%',
                width: '100%',
                padding: '14px 16px',
                borderRadius: '16px 16px 16px 4px',
                background: 'linear-gradient(135deg, rgba(16, 24, 38, 0.75) 0%, rgba(20, 30, 48, 0.65) 100%)',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                position: 'relative'
            }}>
                {/* Keyboard Accessible Dismiss Action */}
                <button
                    type="button"
                    onClick={handleDismiss}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDismiss(); }}
                    aria-label="Dismiss market price insight"
                    title="Dismiss market insight"
                    style={{
                        position: 'absolute', top: 10, right: 10,
                        background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                        padding: 4, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', borderRadius: 4,
                        transition: 'color 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                >
                    <X size={13} aria-hidden="true" />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingRight: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13 }} role="img" aria-label="Lightbulb icon">💡</span>
                        <span style={{ color: '#ffffff', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.01em' }}>
                            {info.headline || 'Good news on market pricing!'}
                        </span>
                    </div>
                    <div style={{
                        padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
                        background: 'rgba(52,211,153,0.12)', border: '0.5px solid rgba(52,211,153,0.3)',
                        color: 'rgba(52,211,153,0.95)'
                    }}>
                        Best Value Found
                    </div>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                    padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.06)',
                    marginBottom: 10
                }}>
                    <div>
                        <p style={{ margin: '0 0 2px 0', fontSize: 9.5, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Your Budget</p>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>{info.formattedBudget}</p>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 2px 0', fontSize: 9.5, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Market Range</p>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{info.formattedRange}</p>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 2px 0', fontSize: 9.5, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Est. Savings</p>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#34d399' }}>{info.savingsText}</p>
                    </div>
                </div>

                <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                    {info.bodyText}
                </p>
            </div>
        </div>
    );
});

// Separate component so it has its own state — cannot use useState inside useMemo
const AgentConfirmCard = React.memo(({ msg, index, setMessages, setCurrentAction, handleApprove }) => {
    const action = msg?.action;
    const [budget, setBudget] = useState('');

    const handleApproveClick = useCallback(() => {
        console.log("BUTTON CLICKED");
        handleApprove({ ...msg.action, budget: budget || null });
    }, [handleApprove, msg.action, budget]);

    const handleCancelClick = useCallback(() => {
        setMessages(prev => prev.map((m, idx) => idx === index ? { role: 'buddy', text: 'Cancelled! Let me know if you need anything else.', timestamp: m.timestamp } : m));
    }, [setMessages, index]);

    if (!action) {
        console.error('[Buddy] AgentConfirmCard missing action prop', msg);
        return null;
    }
    return (
        <MessageBubble role="buddy">
            <Panel
                title="Confirm Automation Task"
                subtitle="AGENT ACTION REQUIRED"
                status={<StatusBadge type="primary">{action.platform}</StatusBadge>}
                content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: 'var(--win-radius-card)', background: 'rgba(255,255,255,0.015)', border: 'var(--win-border-light)' }}>
                            <PackageIcon size={18} />
                            <div>
                                <p style={{ color: 'var(--win-text-primary)', fontSize: 'var(--win-size-body)', fontWeight: 600, margin: 0 }}>{action.platform}</p>
                                <p style={{ color: 'var(--win-text-muted)', fontSize: 'var(--win-size-supporting)', margin: 0, lineHeight: 1.35 }}>{action.description}</p>
                            </div>
                        </div>
                        <div>
                            <p style={{ color: 'var(--win-text-secondary)', fontSize: 'var(--win-size-supporting)', margin: '0 0 6px 0', fontWeight: 500 }}>Max budget (₹) — optional</p>
                            <InputField
                                type="number"
                                placeholder="e.g. 2000  (leave blank = no limit)"
                                value={budget}
                                onChange={e => setBudget(e.target.value)}
                                onKeyDown={e => e.stopPropagation()}
                            />
                        </div>
                    </div>
                }
                actions={
                    <>
                        <PrimaryButton onClick={handleApproveClick} style={{ flex: 1.2 }}>Approve & Run</PrimaryButton>
                        <SecondaryButton onClick={handleCancelClick} style={{ flex: 0.8 }}>Cancel</SecondaryButton>
                    </>
                }
                footer={`⚡ Buddy will open ${action.platform} in Chrome and execute this task automatically.`}
            />
        </MessageBubble>
    );
});

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

const renderAutomationIcon = (icon, color) => {
    const stroke = color ? `${color}1)` : 'rgba(167,139,250,1)';
    const props = { width: 15, height: 15, stroke, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0 } };
    
    switch (icon) {
        case '✅':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            );
        case '⚠️':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            );
        case '🛒':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
            );
        case '💰':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
            );
        case '🔍':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
            );
        case '⚡':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
            );
        case '📦':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
            );
        case '🔐':
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
            );
        case '✨':
        default:
            return (
                <svg {...props} viewBox="0 0 24 24">
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.3-6.3l-.7.7M6.7 17.3l-.7.7m12.6 0l-.7-.7M6.7 6.7l-.7-.7" />
                </svg>
            );
    }
};

const AutomationCard = React.memo(({ icon = '✨', title, description, text, timestamp, index }) => {
    const accent = AUTOMATION_ACCENT_MAP[icon] || 'rgba(99,102,241,';
    return (
        <div className="message-enter" style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            {/* Accent avatar */}
            <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: `${accent}0.15)`,
                border: `1px solid ${accent}0.35)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
                boxShadow: `0 0 8px ${accent}0.15)`
            }}>
                <Sparkles size={10} style={{ color: `${accent}0.95)` }} />
            </div>
            {/* Card body */}
            <div className="passive-glass-card buddy-automation-card" style={{
                maxWidth: '88%',
                width: '100%',
                padding: '10px 14px',
                border: `1px solid ${accent}0.25)`,
                boxShadow: `0 8px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 12px ${accent}0.05)`
            }}>
                {/* Header row: icon + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (description || text) ? 6 : 0 }}>
                    {renderAutomationIcon(icon, accent)}
                    {title && (
                        <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: 600, margin: 0, letterSpacing: '0.01em' }}>
                            {title}
                        </p>
                    )}
                </div>
                {/* Description */}
                {description && (
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {description}
                    </p>
                )}
                {/* Fallback plain text (when no title/description) */}
                {!title && !description && text && (
                    <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {text}
                    </p>
                )}
                {/* Timestamp */}
                {timestamp && (
                    <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.22)', display: 'block', marginTop: 6, fontWeight: 500 }}>
                        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </div>
        </div>
    );
});

const ChatPanel = React.memo(({ chatOpen, isLoading, isTyping, messages = [], onClose, chatEndRef, setMessages, setChatOpen, setSidebarVisible, setPendingAgentAction, setCurrentAction, setAgentStep, handleApprove, handleManualLoginDetected, settingsOpen, setSettingsOpen, onOpenPlayground }) => {
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
                position: 'relative',
                flex: '1 1 0%',
                minHeight: 0,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {/* Slim session action bar — preserves clear chat without duplicate Buddy branding */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 4px 8px',
                flexShrink: 0
            }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.02em' }}>
                    Conversation
                </span>
                <button
                    onClick={() => { setMessages([]); setChatOpen(false); }}
                    title="Clear conversation"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 10, cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                    <X size={10} strokeWidth={2} />
                    <span>Clear</span>
                </button>
            </div>

            {/* Scrollable conversation — single scrollbar spanning full available height */}
            <div
                className="glass-scrollbar overflow-y-auto flex flex-col gap-[16px]"
                style={{
                    flex: '1 1 0%',
                    minHeight: 0,
                    width: '100%',
                    padding: '4px 4px 16px',
                    boxSizing: 'border-box'
                }}
            >
                    {/* TODO: Virtualize message rendering if history grows large (>50 items) */}
                    {messages.map((msg, i) => {

                        // USER MESSAGE
                        if (msg.role === "user") {
                            return (
                                <div key={i} style={{ textAlign: "right", margin: "10px 0" }}>
                                    <div 
                                        className="visionos-user-bubble"

                                    >
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

                        const logInsightAcceptedIfPresent = () => {
                            try {
                                const marketMsg = (messages || []).find(m => m.role === 'market-range');
                                if (marketMsg && marketMsg.info && !marketMsg._acceptedLogged) {
                                    marketMsg._acceptedLogged = true;
                                    console.log('[MarketPriceInsight:Interaction]', {
                                        event: 'InsightAccepted',
                                        category: marketMsg.info.categoryName,
                                        userBudget: marketMsg.info.userBudget,
                                        recommendedRange: marketMsg.info.formattedRange
                                    });
                                }
                            } catch (err) {
                                console.error('[MarketPriceInsight:Error]', 'InsightAccepted log failed:', err?.message);
                            }
                        };

                        const goPrevious = () => {
                            const prevIdx = currentIdx - 1;
                            window._highlightLocks = window._highlightLocks || {};
                            delete window._highlightLocks[`${msg.timestamp}-${prevIdx}`];
                            setMessages(prev => prev.map((m, mIdx) =>
                                mIdx === i ? { ...m, currentIndex: prevIdx, _highlightTriggered: false } : m
                            ));
                        };

                        const goNext = () => {
                            logInsightAcceptedIfPresent();
                            const nextIdx = currentIdx + 1;
                            setMessages(prev => prev.map((m, mIdx) =>
                                mIdx === i ? { ...m, currentIndex: nextIdx, _highlightTriggered: false } : m
                            ));
                        };

                        const handleBuy = async () => {
                            logInsightAcceptedIfPresent();
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
                                <div 
                                    className="glass-card-item"

                                    style={{
                                        maxWidth: '88%', width: '100%',
                                        borderRadius: '16px 16px 16px 4px',
                                        overflow: 'hidden'
                                    }}
                                >

                                    {/* Header bar */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '9px 14px',
                                        background: 'rgba(99,102,241,0.08)',
                                        borderBottom: '0.5px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 500 }}>
                                            Product {currentIdx + 1} of {items.length}
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
                                                Buddy is reviewing this item on Chrome right now.
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
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="rgba(250,204,21,0.85)" stroke="none" style={{ flexShrink: 0 }}>
                                                        <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                                                    </svg>
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
                                                Highlighted in Amazon browser window
                                            </span>
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {/* Previous — only if not first product */}
                                            {currentIdx > 0 && (
                                                <button onClick={goPrevious} style={{
                                                    flex: 1, padding: '9px 0', borderRadius: 10,
                                                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '0.5px solid rgba(255,255,255,0.1)',
                                                    color: 'rgba(255,255,255,0.55)',
                                                    transition: 'all 0.2s ease'
                                                }}>
                                                    Previous
                                                </button>
                                            )}

                                            {/* Buy */}
                                            <button onClick={handleBuy} style={{
                                                flex: 2, padding: '9px 0', borderRadius: 10,
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                background: 'linear-gradient(135deg, rgba(52,211,153,0.22), rgba(16,185,129,0.16))',
                                                border: '0.5px solid rgba(52,211,153,0.4)',
                                                color: 'rgba(167,243,208,0.95)',
                                                transition: 'all 0.2s ease'
                                            }}>
                                                Buy This
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
                                                    Next
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
                                            ? { role: 'buddy', text: 'Checkout cancelled. You can complete it manually in the browser.', timestamp: Date.now() }
                                            : m
                                    ));
                                }}
                            />
                        );
                    }

                    if (msg.role === 'final-approval') {
                        const _fa_product = msg.selectedProduct;
                        const productImage = msg.selectedProduct?.image || msg.product?.image || null;
                        const _fa_hasImage = !!productImage;
                        const _fa_priceDisplay = _fa_product?.price
                            ? (String(_fa_product.price).includes('₹')
                                ? _fa_product.price
                                : `₹${Number(_fa_product.price).toLocaleString('en-IN')}`)
                            : 'N/A';
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                                {/* Buddy avatar dot — unchanged */}
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '0.5px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                    <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
                                </div>

                                {/* ── Premium Checkout Review Card ── */}
                                <div 
                                    className="checkout-review-card glass-card-item premium-glass-card" 
                                    style={{
                                        maxWidth: '92%', width: '100%',
                                        borderRadius: '18px 18px 18px 4px',
                                        background: 'var(--glass-bg-card)',
                                        border: 'var(--glass-border)',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                                        overflow: 'hidden',
                                        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                        position: 'relative',
                                        containerType: 'inline-size'
                                    }}

                                >

                                    {/* ── Glassmorphism color blob (bottom-right) ── */}
                                    <div style={{
                                        position: 'absolute', bottom: -20, right: -20, width: 140, height: 100,
                                        background: 'radial-gradient(circle, rgba(165,180,252,0.08) 0%, transparent 70%)',
                                        filter: 'blur(30px)', pointerEvents: 'none', zIndex: 0
                                    }} />

                                    {/* ─── Header Bar ─── */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 16px',
                                        background: 'rgba(255, 255, 255, 0.015)',
                                        borderBottom: 'var(--glass-border-light)',
                                        position: 'relative', zIndex: 1
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(165,180,252,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                            </svg>
                                            <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}>
                                                Checkout Review
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(52,211,153,0.85)', boxShadow: '0 0 6px rgba(52,211,153,0.6)' }} />
                                            <span style={{ color: 'rgba(52,211,153,0.9)', fontSize: 11, fontWeight: 500 }}>Secure</span>
                                        </div>
                                    </div>

                                    {/* ─── Blue progress accent ─── */}
                                    <div style={{ height: 3, background: 'rgba(255,255,255,0.03)', position: 'relative', overflow: 'hidden', zIndex: 1 }}>
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, height: '100%', width: '65%',
                                            background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)',
                                            borderRadius: '0 2px 2px 0'
                                        }} />
                                    </div>

                                    {/* ─── Body: image + details ─── */}
                                    <div className="checkout-review-body" style={{
                                        display: 'flex', flexDirection: 'row', gap: 14, padding: '14px 16px',
                                        position: 'relative', zIndex: 1
                                    }}>

                                        {/* ── Product Image / Fallback ── */}
                                        <div className="checkout-review-image" style={{
                                            width: 140, minWidth: 140, height: 130,
                                            borderRadius: 14,
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: 'var(--glass-border-light)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            overflow: 'hidden', flexShrink: 0, position: 'relative', zIndex: 1
                                        }}>
                                            {_fa_hasImage ? (
                                                <img
                                                    src={productImage}
                                                    alt={_fa_product.title || 'Product'}
                                                    style={{ maxHeight: '90%', maxWidth: '90%', objectFit: 'contain', borderRadius: 8 }}
                                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                                                />
                                            ) : null}
                                            {/* SVG fallback — shown when no image or image fails to load */}
                                            <div style={{
                                                display: _fa_hasImage ? 'none' : 'flex',
                                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6
                                            }}>
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                                                </svg>
                                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>PRODUCT</span>
                                            </div>
                                        </div>

                                        {/* ── Product Details ── */}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>

                                            {/* Title — 2-line clamp */}
                                            <p style={{
                                                margin: 0, fontSize: 13, fontWeight: 600,
                                                color: 'rgba(255,255,255,0.92)', lineHeight: 1.4,
                                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden', textOverflow: 'ellipsis'
                                            }}>
                                                {_fa_product?.title || 'Item'}
                                            </p>

                                            {/* Price row */}
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{
                                                    fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
                                                    color: 'rgba(52, 211, 153, 0.95)'
                                                }}>
                                                    {_fa_priceDisplay}
                                                </span>
                                            </div>

                                            {/* Info badges row */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                                                {_fa_product?.rating && (
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        padding: '3px 8px', borderRadius: 100,
                                                        background: 'rgba(250,204,21,0.06)',
                                                        border: '0.5px solid rgba(250,204,21,0.18)'
                                                    }}>
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(250,204,21,0.85)" stroke="none" style={{ flexShrink: 0 }}>
                                                            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                                                        </svg>
                                                        <span style={{ color: 'rgba(250,204,21,0.9)', fontSize: 11, fontWeight: 600 }}>{_fa_product.rating}</span>
                                                        {_fa_product.reviews && (
                                                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>({_fa_product.reviews})</span>
                                                        )}
                                                    </div>
                                                )}
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 3.5,
                                                    padding: '3px 8px', borderRadius: 100,
                                                    background: 'rgba(52,211,153,0.06)',
                                                    border: '0.5px solid rgba(52,211,153,0.15)'
                                                }}>
                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                    <span style={{ color: 'rgba(52,211,153,0.85)', fontSize: 10, fontWeight: 500 }}>Ready</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ─── Action Buttons ─── */}
                                    <div style={{
                                        display: 'flex', gap: 10, padding: '0 16px 14px 16px', alignItems: 'center',
                                        position: 'relative', zIndex: 1
                                    }}>
                                        {/* Confirm & Proceed — all handler logic preserved identically */}
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

                                                if (cartStatus === 'target_and_others') {
                                                    setMessages(prev => [...prev, { role: 'buddy', text: '✅ Adding your item to cart...', timestamp: Date.now() }]);

                                                    if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
                                                    const addResult = await window.buddyAgent.checkoutStep({
                                                        type: platform === 'flipkart' ? 'flipkart_add_to_cart' : 'amazon_add_to_cart',
                                                        url: product.url,
                                                        product: product
                                                    });

                                                    if (!addResult?.success && !addResult?.addedToCart) {
                                                        window.electronAPI?.positionShow?.();
                                                        window.electronAPI?.positionCenter?.();
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ Failed to add to cart: ${addResult?.error || 'Unknown'}.`, timestamp: Date.now() }]);
                                                        return;
                                                    }

                                                    const activeProduct = addResult?.resolvedProduct || product;

                                                    setMessages(prev => [...prev, { role: 'buddy', text: '✅ Verifying cart...', timestamp: Date.now() }]);
                                                    const verifyResult = await window.buddyAgent.checkoutStep({
                                                        type: 'amazon_verify_cart_target',
                                                        targetUrl: activeProduct.url,
                                                        targetTitle: activeProduct.title,
                                                        product: activeProduct
                                                    });
                                                    console.log('[Spotlight] [VERIFY_RECEIVE_TRACE] verifyResult:', JSON.stringify(verifyResult));

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
                                                        targetUrl: activeProduct.url,
                                                        targetTitle: activeProduct.title
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

                                                if (cartStatus === 'duplicate_target') {
                                                    setMessages(prev => [...prev, { role: 'buddy', text: '✅ Using existing item in cart and isolating...', timestamp: Date.now() }]);
                                                    if (window.electronAPI?.positionHide) await window.electronAPI.positionHide();
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
                                                        url: product.url,
                                                        product: product
                                                    });
                                                    if (!cartResult?.success && !cartResult?.addedToCart) {
                                                        window.electronAPI?.positionShow?.();
                                                        window.electronAPI?.positionCenter?.();
                                                        setMessages(prev => [...prev, { role: 'buddy', text: `⚠️ ${cartResult?.error || 'Failed to add to cart'}`, timestamp: Date.now() }]);
                                                        return;
                                                    }

                                                    const activeProduct = cartResult?.resolvedProduct || product;

                                                    const verifyResult = await window.buddyAgent.checkoutStep({
                                                        type: 'amazon_verify_cart_target',
                                                        targetUrl: activeProduct.url,
                                                        targetTitle: activeProduct.title,
                                                        product: activeProduct
                                                    });
                                                    console.log('[Spotlight] [VERIFY_RECEIVE_TRACE] verifyResult:', JSON.stringify(verifyResult));

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
                                            }} 
                                            className="liquid-btn"
                                            style={{
                                                flex: 1, padding: '10px 18px', borderRadius: 10,
                                                fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                letterSpacing: '0.01em'
                                            }}>
                                                Confirm & Proceed
                                                <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
                                            </button>

                                        {/* Cancel — handler logic preserved identically */}
                                        <button 
                                            onClick={() => {
                                                setMessages(prev => prev.map((m, mIdx) => mIdx === i ? { role: 'buddy', text: '❌ Checkout cancelled.', timestamp: Date.now() } : m));
                                            }} 
                                            className="liquid-btn-secondary"
                                            style={{
                                                padding: '10px 18px', borderRadius: 10,
                                                fontSize: 12.5, letterSpacing: '0.01em'
                                            }}>
                                                Cancel
                                            </button>
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
                                    <Sparkles size={9} style={{ color: 'rgba(139,92,246,0.8)' }} />
                                </div>
                                <div className="passive-glass-card" style={{
                                    flex: 1, padding: '14px',
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

                                            // Handle review stage result: render approval card if valid, else fail closed
                                            const hasValidReview = (result?.reviewStage?.state === 'AWAITING_CUSTOMER_APPROVAL' && result?.reviewStage?.safeReview);

                                            if (hasValidReview) {
                                                const reviewCard = {
                                                    role: 'purchase-review-approval',
                                                    sessionId: result.reviewStage.sessionId,
                                                    safeReview: result.reviewStage.safeReview,
                                                    timestamp: Date.now()
                                                };
                                                setMessages(prev => prev.map((m, idx) =>
                                                    idx === i
                                                        ? { role: 'buddy', text: `✅ Selected ${method.toUpperCase()} payment successfully!`, timestamp: Date.now() }
                                                        : m
                                                ).concat(reviewCard));
                                            } else {
                                                // FAIL CLOSED (FINDING-2B3-02 REMEDIATION):
                                                // Review verification failed or stage missing.
                                                // STOP — Do NOT render final-confirm, do NOT call amazon_place_order.
                                                const failureReason = result?.reviewStage?.reason || result?.reviewStage?.error || 'Review verification could not establish canonical checkout state.';
                                                setMessages(prev => prev.map((m, idx) =>
                                                    idx === i
                                                        ? { role: 'buddy', text: `⚠️ Selected ${method.toUpperCase()}, but review verification failed: ${failureReason}. Checkout stopped for safety.`, timestamp: Date.now() }
                                                        : m
                                                ));
                                            }
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
                                <div className="passive-glass-card" style={{
                                    maxWidth: '88%', width: '100%',
                                    padding: '14px'
                                }}>
                                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>
                                        Manual Card Entry
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
                                                const hasValidReview = (verifyResult?.reviewStage?.state === 'AWAITING_CUSTOMER_APPROVAL' && verifyResult?.reviewStage?.safeReview);

                                                if (hasValidReview) {
                                                    const reviewCard = {
                                                        role: 'purchase-review-approval',
                                                        sessionId: verifyResult.reviewStage.sessionId,
                                                        safeReview: verifyResult.reviewStage.safeReview,
                                                        timestamp: Date.now()
                                                    };
                                                    setMessages(prev => prev.map((m, idx) =>
                                                        idx === i
                                                            ? { role: 'buddy', text: '✅ Card details verified. Proceeding to review...', timestamp: Date.now() }
                                                            : m
                                                    ).concat(reviewCard));
                                                } else {
                                                    // FAIL CLOSED (FINDING-2B3-02 REMEDIATION):
                                                    // Review verification failed or stage missing.
                                                    // STOP — Do NOT render final-confirm, do NOT call amazon_place_order.
                                                    const failureReason = verifyResult?.reviewStage?.reason || verifyResult?.reviewStage?.error || 'Review verification could not establish canonical checkout state.';
                                                    setMessages(prev => prev.map((m, idx) =>
                                                        idx === i
                                                            ? { role: 'buddy', text: `⚠️ Card details verified, but review verification failed: ${failureReason}. Checkout stopped for safety.`, timestamp: Date.now() }
                                                            : m
                                                    ));
                                                }
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

                    if (msg.role === 'purchase-review-approval') {
                        return (
                            <AgentPurchaseReviewCard
                                key={i}
                                sessionId={msg.sessionId}
                                safeReview={msg.safeReview}
                                onApproved={(approvalResult) => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? {
                                                role: 'buddy',
                                                text: '✅ Purchase Approved! Awaiting order dispatch configuration.',
                                                timestamp: Date.now()
                                            }
                                            : m
                                    ));
                                }}
                                onCancelled={() => {
                                    setMessages(prev => prev.map((m, idx) =>
                                        idx === i
                                            ? {
                                                role: 'buddy',
                                                text: '❌ Purchase cancelled.',
                                                timestamp: Date.now()
                                            }
                                            : m
                                    ));
                                }}
                            />
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
                                <div className="passive-glass-card" style={{
                                    maxWidth: '88%', width: '100%',
                                    padding: '14px'
                                }}>
                                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>
                                        Ready to place your order
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
                                            Place Order
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
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'market-range') {
                        return <AgentMarketRangeCard key={i} info={msg.info} />;
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
                        <MessageBubble key={i} text={msg.text} />
                    );

                })}
                {(isLoading || isTyping) && (
                    <div className="message-enter" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '10px 8px' }}>
                        <div className="typing-avatar" style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1
                        }}>
                            <Sparkles size={11} style={{ color: 'rgba(167,139,250,0.95)' }} className="animate-pulse" />
                        </div>
                        <div style={{
                            padding: '10px 16px', borderRadius: '16px 16px 16px 4px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex', alignItems: 'center', gap: 5,
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)'
                        }}>
                            <style>{`
                                @keyframes typingDot {
                                    0%, 60%, 100% { transform: translateY(0) scale(1); opacity: 0.35; }
                                    30% { transform: translateY(-4px) scale(1.1); opacity: 1; }
                                }
                                .typing-dot {
                                    width: 5px; height: 5px; border-radius: 50%;
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
        </div>
    );
});

const InputBar = React.memo(({ chatOpen, isLoading, isListening, sttOnline, onEscape, onSubmit, onMicClick, inputRef, buddyState }) => {
    const [hasCommand, setHasCommand] = useState(false);
    return (
        <div
            className="buddy-input-bar"
            style={{
                borderRadius: 20,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12
            }}
        >
            <div className="flex items-center gap-2 shrink-0" style={{ paddingLeft: 2 }}>
                <BuddyLogo size="xs" state={hasCommand ? 'typing' : buddyState} />
                <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', flexShrink: 0,
                    color: 'rgba(255,255,255,0.7)'
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
                onHasCommandChange={setHasCommand}
            />
        </div>
    );
});

const SettingsPanel = React.memo(({ visible, onClose, onOpenPlayground }) => (
    <div style={{
        position: 'fixed', top: '74px', bottom: 0, right: 0,
        width: 320, zIndex: 100,
        transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        background: 'linear-gradient(180deg, rgba(16, 18, 28, 0.96) 0%, rgba(10, 12, 18, 0.98) 100%)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex', flexDirection: 'column',
        padding: '16px',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
        boxSizing: 'border-box'
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

            {/* Development / Playground */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(111, 124, 255, 0.08)', border: '1px solid rgba(111, 124, 255, 0.2)' }}>
                <p style={{ color: 'var(--win-accent-secondary)', fontSize: 10, letterSpacing: '0.06em', margin: '0 0 4px' }}>DEVELOPMENT</p>
                <PrimaryButton 
                    onClick={() => {
                        onClose();
                        if (onOpenPlayground) onOpenPlayground();
                    }} 
                    style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        width: '100%'
                    }}
                >
                    Launch UI Playground
                </PrimaryButton>
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
    const { isMaximized } = useWindowControls();
    const [messages, setMessages] = useState(() => {
        const history = getHistory();
        return Array.isArray(history) ? history : [];
    });
    const [chatSessions, setChatSessions] = useState([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
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

    const buddyState = useMemo(() => {
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'agent-confirm' || lastMsg.role === 'final-approval' || lastMsg.role === 'payment-select' || lastMsg.role === 'pre-checkout') {
                return 'awaiting';
            }
        }
        if (isLoading || isTyping) {
            return 'thinking';
        }
        if (currentAction || (agentStep !== 'idle' && agentStep !== 'done')) {
            return 'working';
        }
        if (agentStep === 'done') {
            return 'success';
        }
        return 'idle';
    }, [messages, isLoading, isTyping, currentAction, agentStep]);

    // Handles user clicking a product from the product-selection card
    const handleApprove = useCallback(async (action) => {
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
                const recItems = (result.products || []).slice(0, 5).map(p => ({
                    title: p.title || 'Unknown product',
                    price: p.price || 'N/A',
                    image: p.image || null,
                    rating: p.rating || null,
                    url: p.url || null,
                }));
                const marketInfo = detectMarketPriceRange(action.budget, recItems, action.query);
                const nextMsgs = [];
                if (marketInfo) {
                    nextMsgs.push({
                        role: "market-range",
                        info: marketInfo,
                        timestamp: Date.now()
                    });
                }
                nextMsgs.push({
                    role: "product-selection",
                    items: recItems,
                    currentIndex: 0,
                    _browserScrolled: false,
                    timestamp: Date.now()
                });
                setMessages(prev => [...prev, ...nextMsgs]);
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
    }, [setCurrentAction, setMessages]);

    const handleManualLoginDetected = useCallback(async () => {
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
            const recItems = (result.products || []).slice(0, 5).map(p => ({
                title: p.title || 'Unknown product',
                price: p.price || 'N/A',
                image: p.image || null,
                rating: p.rating || null,
                url: p.url || null,
            }));
            const marketInfo = detectMarketPriceRange(currentAction?.budget, recItems, currentAction?.query);
            const nextMsgs = [];
            if (marketInfo) {
                nextMsgs.push({
                    role: "market-range",
                    info: marketInfo,
                    timestamp: Date.now()
                });
            }
            nextMsgs.push({
                role: "product-selection",
                items: recItems,
                currentIndex: 0,
                _browserScrolled: false,
                timestamp: Date.now()
            });
            setMessages(prev => [...prev, ...nextMsgs]);

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
    }, [currentAction, setMessages]);

    const handleProductSelect = useCallback(async (item) => {
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
    }, [setSelectedProduct, setMessages]);

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
            'purchase-review-approval',
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

    const handleToggleHistory = useCallback(() => {
        setIsHistoryOpen(prev => !prev);
    }, []);

    const handleCloseHistory = useCallback(() => {
        setIsHistoryOpen(false);
    }, []);

    const handleSelectSession = useCallback((s) => {
        setMessages(Array.isArray(s?.messages) ? s.messages : []);
        setActiveSession(s);
        setChatOpen(true);
        setIsHistoryOpen(false);
    }, []);

    const handleNewChat = useCallback(() => {
        setMessages(prev => {
            if (prev.length > 0) {
                const session = {
                    id: Date.now(),
                    title: prev.find(m => m?.role === 'user')?.text?.slice(0, 25) || 'Chat',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    messages: [...prev]
                };
                setChatSessions(prevSessions => [session, ...prevSessions].slice(0, 20));
            }
            return [];
        });
        setChatOpen(false);
        setActiveSession(null);
        setSidebarVisible(true);
        setIsHistoryOpen(false);
    }, []);



    useEffect(() => {
        document.body.style.overflow = 'hidden';

        const testMsgHandler = (e) => {
            if (e.detail) {
                setMessages(prev => [...prev, e.detail]);
                setChatOpen(true);
            }
        };
        window.addEventListener('buddy:inject-message', testMsgHandler);

        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('buddy:inject-message', testMsgHandler);
        };
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            const container = chatEndRef.current.parentElement;
            if (container && container.classList.contains('glass-scrollbar')) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            } else {
                chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
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
        const closeKeywords = ['close the app', 'close app', 'close buddy', 'exit', 'exit app', 'quit', 'quit app', 'shut down', 'goodbye buddy', 'bye buddy', 'close now'];
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
        opacity: mainVisible ? 1 : 0,
        transition: 'opacity 0.28s ease',
        pointerEvents: mainVisible ? 'auto' : 'none'
    }), [mainVisible]);

    // Safety guard — should never be null due to useState initializer, but protects render
    if (!messages || !Array.isArray(messages)) return null;
    return (
        <>
            <style>{`
                @keyframes floatingImage {
                    0% { transform: translateY(0); }
                    50% { transform: translateY(-4px); }
                    100% { transform: translateY(0); }
                }
                .floating-product-preview {
                    animation: floatingImage 7s ease-in-out infinite;
                }

                @keyframes meshMovement {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                .animated-mesh-gradient {
                    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%);
                    background-size: 200% 200%;
                    animation: meshMovement 12s ease-in-out infinite;
                }

                /* Native Font Stack */
                #buddy-root, .buddy-os-container, button, input {
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", sans-serif !important;
                }

                :root {
                    /* Premium Color Palette */
                    --buddy-bg: #0B0D12;
                    --buddy-surface: #141821;
                    --buddy-surface-elevated: #1B2230;
                    --buddy-primary: #6D7DFF;
                    --buddy-primary-muted: rgba(109, 125, 255, 0.15);
                    --buddy-secondary: #7F5AF0;
                    --buddy-secondary-muted: rgba(127, 90, 240, 0.12);
                    --buddy-success: #2DD4BF;
                    --buddy-warning: #F6C453;
                    --buddy-error: #FF6B6B;
                    --buddy-text-primary: #F5F7FA;
                    --buddy-text-secondary: #A7B0C0;
                    --buddy-text-tertiary: rgba(167, 176, 192, 0.4);

                    /* Blurs */
                    --glass-blur-main: 20px;
                    --glass-blur-card: 8px; /* Tier 1 Premium */
                    --glass-border: 1px solid rgba(255, 255, 255, 0.08);
                    --glass-border-light: 1px solid rgba(255, 255, 255, 0.05);
                    --glass-bg-main: linear-gradient(135deg, rgba(20, 24, 33, 0.55) 0%, rgba(11, 13, 18, 0.75) 100%);
                    --glass-bg-card: rgba(255, 255, 255, 0.035);
                    --glass-bg-passive: rgba(255, 255, 255, 0.015);
                }

                /* Context-Aware Glass Base (Container Only) */
                .buddy-os-container {
                    backdrop-filter: blur(var(--glass-blur-main)) saturate(150%) contrast(98%) brightness(102%) !important;
                    -webkit-backdrop-filter: blur(var(--glass-blur-main)) saturate(150%) contrast(98%) brightness(102%) !important;
                }

                /* Tier 1 Premium Interactive Card (Checkout, Product, Payment, Login) */
                .premium-glass-card {
                    backdrop-filter: blur(var(--glass-blur-card)) saturate(140%) contrast(98%) brightness(104%) !important;
                    -webkit-backdrop-filter: blur(var(--glass-blur-card)) saturate(140%) contrast(98%) brightness(104%) !important;
                    background: var(--glass-bg-card) !important;
                    border: var(--glass-border) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.14) !important;
                    box-shadow: 
                        0 1px 2px rgba(0, 0, 0, 0.1),
                        0 4px 10px rgba(0, 0, 0, 0.15),
                        0 10px 24px rgba(0, 0, 0, 0.12),
                        inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease !important;
                    transform: translateY(0px) !important;
                }
                .premium-glass-card:hover {
                    border-color: rgba(255, 255, 255, 0.14) !important;
                    transform: translateY(-2px) !important;
                    box-shadow: 
                        0 2px 4px rgba(0, 0, 0, 0.12),
                        0 8px 16px rgba(0, 0, 0, 0.18),
                        0 18px 36px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
                }

                /* Tier 2 Standard Interactive Card */
                .glass-card-item:not(.premium-glass-card) {
                    position: relative;
                    background: var(--glass-bg-card) !important;
                    border: var(--glass-border-light) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
                    border-radius: 16px !important;
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease !important;
                    transform: translateY(0px) !important;
                    overflow: hidden;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                }
                .glass-card-item:not(.premium-glass-card):hover {
                    border-color: rgba(255, 255, 255, 0.12) !important;
                    transform: translateY(-1.5px) !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
                }

                /* Tier 2/3 Standard Passive Glass Card */
                .passive-glass-card {
                    position: relative;
                    background: var(--glass-bg-passive) !important;
                    border: var(--glass-border-light) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
                    border-radius: 14px !important;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
                    overflow: hidden;
                    transition: border-color 0.25s ease, background-color 0.25s ease !important;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                }

                /* Premium Diagonal Shimmer with Cooldown (Tier 1 only) */
                .premium-glass-card::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    border-radius: inherit;
                    background: linear-gradient(
                        135deg,
                        transparent 30%,
                        rgba(255, 255, 255, 0.03) 45%,
                        rgba(255, 255, 255, 0.07) 50%,
                        rgba(255, 255, 255, 0.03) 55%,
                        transparent 70%
                    );
                    background-size: 250% 250%;
                    background-position: -150% -150%;
                    opacity: 0;
                    transition: opacity 0.4s ease, background-position 0s 1s;
                    z-index: 2;
                }
                .premium-glass-card:hover::after {
                    opacity: 1;
                    background-position: 150% 150%;
                    transition: opacity 0.3s ease, background-position 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                }

                /* Window-level liquid glass container */
                .buddy-os-container {
                    position: relative;
                    background: var(--glass-bg-main) !important;
                    border: var(--glass-border) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.12) !important;
                    border-radius: 24px !important;
                    box-shadow: 
                        0 2px 4px rgba(0, 0, 0, 0.15), 
                        0 12px 32px rgba(0, 0, 0, 0.25), 
                        0 32px 64px rgba(0, 0, 0, 0.2), 
                        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
                    overflow: hidden;
                    transition: box-shadow 0.3s ease, border-color 0.3s ease !important;
                }

                /* VisionOS-style user message bubbles */
                .visionos-user-bubble {
                    display: inline-block !important;
                    padding: 11px 18px !important;
                    border-radius: 18px 18px 4px 18px !important;
                    background: rgba(255, 255, 255, 0.06) !important;
                    border: 1px solid rgba(255, 255, 255, 0.12) !important;
                    color: var(--buddy-text-primary) !important;
                    font-size: 13.5px !important;
                    line-height: 1.5 !important;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
                    max-width: 82% !important;
                    word-break: break-word !important;
                    text-align: left !important;
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease !important;
                    transform: translateY(0px) !important;
                    position: relative;
                    overflow: hidden;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                }
                .visionos-user-bubble:hover {
                    border-color: rgba(255, 255, 255, 0.2) !important;
                    transform: translateY(-0.5px) !important;
                }

                /* Raycast assistant message panels (Passive Glass) */
                .raycast-assistant-panel {
                    padding: 12px 16px !important;
                    border-radius: 14px !important;
                    background: rgba(255, 255, 255, 0.015) !important;
                    border: 1px solid rgba(255, 255, 255, 0.04) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
                    margin: 8px 0 !important;
                    display: flex !important;
                    gap: 12px !important;
                    align-items: flex-start !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                }

                /* AutomationCard custom hover elevation (Tier 2 + hover translate) */
                .buddy-automation-card {
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                }
                .buddy-automation-card:hover {
                    transform: translateY(-1px) !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
                }

                /* Buddy Orb Styles */
                .buddy-orb-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .buddy-orb-container:hover {
                    transform: scale(1.04);
                }
                .buddy-orb-sphere {
                    position: relative;
                    border-radius: 50%;
                    background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.02) 65%, rgba(0, 0, 0, 0.4) 100%);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 
                        inset 0 4px 10px rgba(255, 255, 255, 0.22),
                        inset 0 -4px 10px rgba(0, 0, 0, 0.5),
                        0 4px 12px rgba(0, 0, 0, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.35);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    transition: all 0.4s ease;
                }
                .buddy-orb-sheen {
                    position: absolute;
                    top: 2%;
                    left: 15%;
                    width: 70%;
                    height: 35%;
                    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0) 100%);
                    border-radius: 50% 50% 40% 40% / 60% 60% 30% 30%;
                    pointer-events: none;
                    z-index: 4;
                }
                .buddy-orb-light {
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    background: radial-gradient(circle at 50% 50%, rgba(129, 140, 248, 0.45) 0%, rgba(99, 102, 241, 0.05) 55%, transparent 100%);
                    mix-blend-mode: screen;
                    z-index: 2;
                    transition: all 0.3s ease;
                }
                .buddy-orb-light-secondary {
                    position: absolute;
                    inset: -20%;
                    border-radius: 50%;
                    background: radial-gradient(circle at 70% 80%, rgba(167, 139, 250, 0.35) 0%, rgba(139, 92, 246, 0.05) 45%, transparent 70%);
                    mix-blend-mode: screen;
                    z-index: 3;
                    transition: all 0.4s ease;
                }
                .buddy-orb-ripple {
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    border: 1px solid rgba(139, 92, 246, 0.25);
                    pointer-events: none;
                    opacity: 0;
                    z-index: 1;
                }

                /* Orb state animations (Optimized: Opacity & Scale only) */
                .buddy-orb-container.state-idle .buddy-orb-sphere {
                    animation: orbIdle 6s ease-in-out infinite;
                }
                .buddy-orb-container.state-idle .buddy-orb-light {
                    background: radial-gradient(circle at 35% 35%, rgba(147, 197, 253, 0.25) 0%, rgba(99, 102, 241, 0.05) 60%, transparent 100%);
                }
                .buddy-orb-container.state-idle .buddy-orb-light-secondary {
                    background: radial-gradient(circle at 65% 65%, rgba(167, 139, 250, 0.15) 0%, transparent 60%);
                    animation: orbIdleGlow 8s ease-in-out infinite;
                }
                @keyframes orbIdle {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                }
                @keyframes orbIdleGlow {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.75; }
                }

                .buddy-orb-container.state-thinking .buddy-orb-sphere {
                    animation: orbThinking 2.5s ease-in-out infinite;
                }
                .buddy-orb-container.state-thinking .buddy-orb-light {
                    background: radial-gradient(circle at 50% 50%, rgba(147, 197, 253, 0.35) 0%, rgba(167, 139, 250, 0.25) 50%, transparent 80%);
                    animation: orbLightPulse 2.5s ease-in-out infinite alternate;
                }
                .buddy-orb-container.state-thinking .buddy-orb-light-secondary {
                    background: radial-gradient(circle at 30% 70%, rgba(167, 139, 250, 0.35) 0%, rgba(255, 255, 255, 0.15) 50%, transparent 80%);
                    animation: orbLightPulse 3s ease-in-out infinite alternate-reverse;
                }
                @keyframes orbThinking {
                    0%, 100% { transform: scale(1); opacity: 0.85; }
                    50% { transform: scale(1.04); opacity: 1; }
                }
                @keyframes orbLightPulse {
                    0% { transform: scale(1); opacity: 0.6; }
                    100% { transform: scale(1.05); opacity: 1; }
                }

                .buddy-orb-container.state-typing .buddy-orb-sphere {
                    animation: orbTyping 2s ease-in-out infinite;
                }
                .buddy-orb-container.state-typing .buddy-orb-light {
                    background: radial-gradient(circle at 50% 50%, rgba(109, 125, 255, 0.45) 0%, rgba(127, 90, 240, 0.2) 60%, transparent 90%);
                    animation: orbLightPulse 2s ease-in-out infinite;
                }
                @keyframes orbTyping {
                    0%, 100% { transform: scale(1.01); opacity: 0.9; }
                    50% { transform: scale(1.03); opacity: 1; }
                }

                .buddy-orb-container.state-working .buddy-orb-sphere {
                    animation: orbWorking 2s ease-in-out infinite;
                }
                .buddy-orb-container.state-working .buddy-orb-light {
                    background: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.4) 0%, rgba(129, 140, 248, 0.1) 60%, transparent 90%);
                }
                .buddy-orb-container.state-working .buddy-orb-light-secondary {
                    background: radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.3) 0%, transparent 60%);
                    animation: orbLightPulse 2s ease-in-out infinite;
                }
                @keyframes orbWorking {
                    0%, 100% { transform: scale(1); opacity: 0.9; }
                    50% { transform: scale(1.03); opacity: 1; }
                }

                .buddy-orb-container.state-awaiting .buddy-orb-sphere {
                    animation: orbAwaiting 3s ease-in-out infinite;
                    border-color: rgba(251, 191, 36, 0.25);
                }
                .buddy-orb-container.state-awaiting .buddy-orb-light {
                    background: radial-gradient(circle at 40% 40%, rgba(251, 146, 60, 0.3) 0%, rgba(251, 191, 36, 0.08) 50%, transparent 80%);
                }
                .buddy-orb-container.state-awaiting .buddy-orb-light-secondary {
                    background: radial-gradient(circle at 70% 70%, rgba(139, 92, 246, 0.2) 0%, transparent 70%);
                }
                @keyframes orbAwaiting {
                    0%, 100% { transform: scale(1); opacity: 0.88; }
                    50% { transform: scale(1.025); opacity: 1; }
                }

                .buddy-orb-container.state-success .buddy-orb-sphere {
                    border-color: rgba(52, 211, 153, 0.4);
                    background: radial-gradient(circle at 35% 35%, rgba(52, 211, 153, 0.25) 0%, rgba(0, 0, 0, 0.5) 100%);
                    box-shadow: inset 0 4px 10px rgba(255, 255, 255, 0.25), inset 0 -4px 10px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(52, 211, 153, 0.25);
                }
                .buddy-orb-container.state-success .buddy-orb-light {
                    background: radial-gradient(circle at 50% 50%, rgba(52, 211, 153, 0.35) 0%, rgba(16, 185, 129, 0.05) 60%, transparent 90%);
                }
                .buddy-orb-container.state-success .buddy-orb-light-secondary {
                    background: transparent;
                }
                .buddy-orb-container.state-success .buddy-orb-ripple {
                    animation: orbSuccessRipple 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes orbSuccessRipple {
                    0% { transform: scale(0.9); opacity: 1; border-color: rgba(52, 211, 153, 0.5); }
                    100% { transform: scale(1.6); opacity: 0; border-color: rgba(52, 211, 153, 0); }
                }

                /* Physical buttons with spring return animations */
                .liquid-btn {
                    position: relative;
                    overflow: hidden;
                    background: linear-gradient(135deg, var(--buddy-primary) 0%, var(--buddy-secondary) 100%) !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
                    color: var(--buddy-text-primary) !important;
                    font-weight: 500 !important;
                    transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s cubic-bezier(0.16, 1, 0.3, 1), filter 0.15s ease !important;
                    cursor: pointer !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                .liquid-btn:hover {
                    transform: translateY(-1px) !important;
                    filter: brightness(1.08);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12), 0 6px 14px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
                }
                .liquid-btn:active {
                    transform: scale(0.98) translateY(0) !important;
                    filter: brightness(0.95);
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(0, 0, 0, 0.1) !important;
                    transition-duration: 0.12s !important;
                }
                .liquid-btn:disabled {
                    background: rgba(255, 255, 255, 0.03) !important;
                    border: 1px solid rgba(255, 255, 255, 0.06) !important;
                    color: var(--buddy-text-tertiary) !important;
                    cursor: not-allowed !important;
                    box-shadow: none !important;
                    transform: none !important;
                    filter: none !important;
                }

                .liquid-btn-secondary {
                    position: relative;
                    overflow: hidden;
                    background: rgba(255, 255, 255, 0.03) !important;
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
                    color: var(--buddy-text-secondary) !important;
                    font-weight: 500 !important;
                    transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, background-color 0.15s ease !important;
                    cursor: pointer !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                .liquid-btn-secondary:hover {
                    border-color: rgba(255, 255, 255, 0.15) !important;
                    background-color: rgba(255, 255, 255, 0.06) !important;
                    color: var(--buddy-text-primary) !important;
                }
                .liquid-btn-secondary:active {
                    transform: scale(0.98) !important;
                    transition-duration: 0.12s !important;
                }

                /* Static Depth-giving Background Orbs (No continual animation, zero layout redraw) */
                .orb1 { opacity: 0.75; }
                .orb2 { opacity: 0.75; }

                /* Scrollbars & Fade Edges */
                .glass-scrollbar::-webkit-scrollbar {
                    width: 5px;
                }
                .glass-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .glass-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 10px;
                }
                .glass-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.16);
                }

                .buddy-chat-container {
                    position: relative;
                }
                .buddy-chat-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 16px;
                    background: linear-gradient(to bottom, rgba(12, 12, 20, 0.9) 0%, transparent 100%);
                    pointer-events: none;
                    z-index: 5;
                }
                .buddy-chat-container::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 16px;
                    background: linear-gradient(to top, rgba(12, 12, 20, 0.9) 0%, transparent 100%);
                    pointer-events: none;
                    z-index: 5;
                }

                /* ChatGPT/Apple-quality Message Entry Reveal */
                @keyframes messageIn {
                    0% { opacity: 0; transform: translateY(8px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .message-enter {
                    animation: messageIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }

                /* Buddy Logo Entrance */
                @keyframes logoEntrance {
                    0% { opacity: 0; transform: scale(0.8) translateY(12px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                .buddy-logo-entrance {
                    animation: logoEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                /* Apple Intelligence typography reveals */
                @keyframes titleEntrance {
                    0% { opacity: 0; transform: translateY(6px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .buddy-title-entrance {
                    animation: titleEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    animation-delay: 0.1s;
                    opacity: 0;
                }
                .buddy-subtitle-entrance {
                    animation: titleEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    animation-delay: 0.25s;
                    opacity: 0;
                }
                .buddy-shortcut-entrance {
                    animation: titleEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    animation-delay: 0.4s;
                    opacity: 0;
                }

                /* Softer premium glass capsule input with focus glow */
                .buddy-input-bar {
                    background: rgba(20, 24, 33, 0.45) !important;
                    border: 1px solid rgba(255, 255, 255, 0.06) !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
                    transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, border-radius 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .buddy-input-bar:focus-within {
                    border-color: rgba(109, 125, 255, 0.25) !important;
                    background: rgba(20, 24, 33, 0.6) !important;
                    box-shadow: 0 4px 16px rgba(109, 125, 255, 0.05), 0 0 0 1px rgba(109, 125, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
                }

                /* Rebudget warning customized border */
                .glass-card-item.buddy-rebudget-warning {
                    border: 1px solid rgba(239, 68, 68, 0.22) !important;
                }

                /* Premium details card glow overrides */
                .checkout-review-card {
                    position: relative;
                    container-type: inline-size;
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease !important;
                }

                @container (max-width: 340px) {
                    .checkout-review-body {
                        flex-direction: column !important;
                    }
                    .checkout-review-image {
                        width: 100% !important;
                        min-width: unset !important;
                        height: 150px !important;
                    }
                }

                /* Reduced Motion Mode */
                @media (prefers-reduced-motion: reduce) {
                    .glass-card-item, .visionos-user-bubble, .checkout-review-card, .buddy-os-container {
                        transform: none !important;
                        transition: none !important;
                    }
                    .glass-card-item::after, .checkout-review-card::after, .buddy-os-container::after, .visionos-user-bubble::after {
                        display: none !important;
                    }
                    .buddy-orb-container, .buddy-orb-sphere, .buddy-orb-light, .buddy-orb-light-secondary, .buddy-orb-ripple {
                        animation: none !important;
                        transform: none !important;
                        transition: none !important;
                    }
                    .buddy-automation-card {
                        transform: none !important;
                        transition: none !important;
                    }
                }
            `}</style>
            {showSplash && <WelcomeSplash onDone={handleSplashDone} />}
            <Sidebar visible={sidebarVisible && mainVisible} />
            <LeftSidebar
                isOpen={isHistoryOpen}
                onClose={handleCloseHistory}
                sessions={chatSessions || []}
                activeSession={activeSession}
                onSelect={handleSelectSession}
                onNew={handleNewChat}
            />
            <SettingsPanel
                visible={settingsOpen}
                onClose={() => setSettingsOpen(false)}
            />

            <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{
                ...spotlightStyle,
                opacity: mainVisible ? 1 : 0,
                pointerEvents: mainVisible ? 'auto' : 'none',
                transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                background: 'radial-gradient(ellipse at top, #141a2e 0%, #0B0D14 70%)',
                border: isMaximized ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: isMaximized ? 0 : 10
            }}>
                {/* 1. Window Shell — OS-level chrome only */}
                <TitleBar />

                {/* 2. Buddy Application Header — branding & app controls */}
                <div
                    className="buddy-app-header"
                    style={{
                        width: '100%',
                        height: '42px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 16px',
                        background: 'linear-gradient(180deg, rgba(20, 24, 35, 0.5) 0%, rgba(14, 16, 24, 0.4) 100%)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        flexShrink: 0,
                        boxSizing: 'border-box'
                    }}
                >
                    {/* Left: Sidebar toggle + Branding + Model badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={handleToggleHistory}
                            title="Toggle Chat History"
                            aria-label="Toggle Chat History"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                color: 'rgba(255,255,255,0.55)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 6,
                                borderRadius: 6,
                                transition: 'all 0.18s ease'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                                e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                            }}
                        >
                            <Menu size={14} />
                        </button>

                        {/* Divider */}
                        <div style={{ width: '1px', height: 18, background: 'rgba(255,255,255,0.06)' }} />

                        {/* Logo + Title */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BuddyLogo size="xs" state="idle" />
                            <span style={{
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text'
                            }}>BUDDY</span>
                        </div>

                        {/* Model Badge */}
                        <div style={{
                            padding: '3px 10px',
                            borderRadius: 100,
                            fontSize: 10,
                            background: 'rgba(109, 125, 255, 0.08)',
                            border: '1px solid rgba(109, 125, 255, 0.2)',
                            color: 'rgba(167, 139, 250, 0.85)',
                            fontWeight: 600,
                            letterSpacing: '0.01em'
                        }}>Gemini 2.5 Flash</div>
                    </div>

                    {/* Right: Settings toggle */}
                    <button
                        onClick={() => setSettingsOpen(prev => !prev)}
                        title="Settings"
                        aria-label="Settings"
                        style={{
                            background: settingsOpen ? 'rgba(109, 125, 255, 0.1)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${settingsOpen ? 'rgba(109, 125, 255, 0.25)' : 'rgba(255,255,255,0.07)'}`,
                            color: settingsOpen ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.45)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 6,
                            borderRadius: 6,
                            transition: 'all 0.18s ease'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                            e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = settingsOpen ? 'rgba(109, 125, 255, 0.1)' : 'rgba(255,255,255,0.03)';
                            e.currentTarget.style.color = settingsOpen ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.45)';
                        }}
                    >
                        <Settings size={14} />
                    </button>
                </div>

                {/* 3. Application Body — fills remaining height below Window Shell & App Header */}
                <div style={{
                    flex: '1 1 0%',
                    width: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    {/* Ambient background orbs - contained inside overflow-hidden layer so they do not expand appBody scrollHeight */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        overflow: 'hidden',
                        pointerEvents: 'none',
                        zIndex: 0
                    }}>
                        <div className="orb1" style={{
                            position: 'absolute', width: 500, height: 500,
                            borderRadius: '50%', pointerEvents: 'none',
                            background: 'radial-gradient(circle, rgba(165,180,252,0.08) 0%, rgba(99,102,241,0.03) 50%, transparent 75%)',
                            top: '15%', left: '25%', transform: 'translate(-50%, -50%)',
                            filter: 'blur(30px)'
                        }} />
                        <div className="orb2" style={{
                            position: 'absolute', width: 450, height: 450,
                            borderRadius: '50%', pointerEvents: 'none',
                            background: 'radial-gradient(circle, rgba(167,139,250,0.05) 0%, rgba(139,92,246,0.02) 50%, transparent 75%)',
                            bottom: '15%', right: '25%', transform: 'translate(50%, 50%)',
                            filter: 'blur(30px)'
                        }} />
                    </div>

                    {/* Content wrapper — centered, max-width constrained, full available height flex-col */}
                    <div 
                        style={{ 
                            position: 'relative', 
                            width: '100%', 
                            maxWidth: 680,
                            flex: '1 1 0%',
                            minHeight: 0,
                            display: 'flex', 
                            flexDirection: 'column',
                            padding: '0 16px',
                            boxSizing: 'border-box'
                        }} 
                    >
                        {/* A. Active Chat Workspace — fills all available height between Header & Input */}
                        {((messages || []).length > 0 || chatOpen) && (
                            <div style={{
                                flex: '1 1 0%',
                                minHeight: 0,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <ChatPanel
                                    chatEndRef={chatEndRef}
                                    chatOpen={true}
                                    isLoading={isLoading}
                                    isTyping={isTyping}
                                    messages={messages || []}
                                    onClose={handleChatClose}
                                    setMessages={setMessages}
                                    setChatOpen={setChatOpen}
                                    setSidebarVisible={setSidebarVisible}
                                    setPendingAgentAction={setPendingAgentAction}
                                    setCurrentAction={setCurrentAction}
                                    setAgentStep={setAgentStep}
                                    handleApprove={handleApprove}
                                    handleManualLoginDetected={handleManualLoginDetected}
                                    settingsOpen={settingsOpen}
                                    setSettingsOpen={setSettingsOpen}
                                />
                            </div>
                        )}

                        {/* B. Empty state — centered in available space when no messages */}
                        {(messages || []).length === 0 && !chatOpen && (
                            <div style={{
                                flex: '1 1 0%',
                                minHeight: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <div style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    gap: 10, padding: '24px 20px'
                                }}>
                                    <BuddyLogo size="md" state="idle" />
                                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', lineHeight: 1.6, fontWeight: 500, margin: '8px 0 0' }}>
                                        What can I help you with today?
                                    </p>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {['Open Chrome', 'Search YouTube', 'Tell me a joke'].map(s => (
                                            <button 
                                                key={s} 
                                                onClick={() => { inputRef.current?.setCommand(s); inputRef.current?.focus(); }}
                                                className="liquid-btn-secondary"
                                                style={{
                                                    padding: '6px 16px', borderRadius: 100, fontSize: 11,
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    color: 'rgba(255,255,255,0.7)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                                    e.currentTarget.style.color = '#ffffff';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                                                }}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* C. Input bar — anchored at bottom */}
                        <div style={{ flexShrink: 0, padding: '8px 0 10px' }}>
                            <InputBar
                                chatOpen={(messages || []).length > 0 || chatOpen}
                                inputRef={inputRef}
                                isLoading={isLoading}
                                isListening={isListening}
                                sttOnline={sttOnline}
                                onEscape={handleEscape}
                                onSubmit={handleSubmit}
                                onMicClick={handleMicClick}
                                buddyState={buddyState}
                            />
                            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, letterSpacing: '0.02em', textAlign: 'center', margin: '8px 0 4px' }}>
                                Press <kbd style={{ fontFamily: 'monospace', padding: '1px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>Esc</kbd> to close chat | <kbd style={{ fontFamily: 'monospace', padding: '1px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>Ctrl+Alt+B</kbd> to toggle
                            </p>
                        </div>
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
                    <p style={{ fontSize: 14, marginBottom: 8 }}>Something went wrong</p>
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