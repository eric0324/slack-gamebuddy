// 間諜危機的英文地點庫：和 LOCATIONS 一對一翻譯、順序相同。
// 描述句不能包含地點名稱；通用問題和間諜回答不能包含任何地點名稱 (有測試檢查，英文用整個單字比對)。
import type { Location } from './spyfallLocations.js';

const loc = (name: string, roles: string[], hints: string[]): Location => ({ name, roles, hints });

export const LOCATIONS_EN: Location[] = [
  loc('Office Party', ['Boss', 'Salesperson', 'Engineer', 'Emcee', 'New Hire', 'Accountant'], ['Everyone is waiting for the raffle', 'Someone is performing on stage', 'Lots of food on the tables', 'People are getting a bit drunk']),
  loc('Emergency Room', ['Doctor', 'Nurse', 'Patient', 'Family Member', 'Paramedic', 'Security Guard'], ['Ambulance sirens all the time', 'The wait is long', 'Someone is crying', 'Strong smell of disinfectant']),
  loc('Night Market', ['Vendor', 'Visitor', 'Foreign Tourist', 'Couple', 'Kid', 'Cleaner'], ['Packed with people', 'Lots of street food', 'You can play ring toss', 'Only gets lively after dark']),
  loc('Wedding', ['Groom', 'Bride', 'Best Man', 'Bridesmaid', 'Emcee', 'Relative'], ['You bring a gift of money', 'The bouquet gets tossed', 'A slideshow of childhood photos plays', 'Everyone is dressed up']),
  loc('Karaoke Room', ['Mic Hog', 'Waiter', 'Off-Key Singer', 'Song Picker', 'Coworker', 'Drunk Guest'], ['Very loud', 'Dim lighting', 'Waiting for the next song', 'Someone is singing a love song']),
  loc('Subway Car', ['Driver', 'Commuter', 'Student', 'Backpacker', 'Station Staff', 'Parent with Stroller'], ['It sways', 'Crowded at rush hour', 'Announcements call out the stops', 'No eating allowed']),
  loc('Convenience Store', ['Clerk', 'Customer', 'Delivery Driver', 'Store Manager', 'Food Courier', 'Night Owl'], ['Open 24 hours', 'A chime when you walk in', 'You can collect points', 'You can pay bills here']),
  loc('Gym', ['Trainer', 'Member', 'Bodybuilder', 'Beginner', 'Front Desk Staff', 'Yoga Teacher'], ['Mirrors everywhere', 'Someone is grunting loudly', 'Lots of equipment', 'Everyone is sweating']),
  loc('Airport', ['Pilot', 'Flight Attendant', 'Traveler', 'Customs Officer', 'Ground Staff', 'Security'], ['You line up for security', 'Everyone has lots of luggage', 'There are duty-free shops', 'Announcements keep paging people']),
  loc('Classroom', ['Teacher', 'Student', 'Class President', 'Transfer Student', 'Student on Duty', 'Drill Instructor'], ['There is a blackboard', 'You hear the bell ring', 'Someone is secretly napping', 'Very quiet during tests']),
  loc('Movie Theater', ['Audience Member', 'Ticket Seller', 'Cleaner', 'Couple', 'Projectionist', 'Popcorn Seller'], ['Very dark', 'Phones on silent', 'Smells like popcorn', 'The screen is huge']),
  loc('Amusement Park', ['Visitor', 'Staff', 'Mascot', 'Kid', 'Couple', 'Vendor'], ['Long lines', 'People screaming nonstop', 'There is a roller coaster', 'There is a parade']),
  loc('Space Station', ['Astronaut', 'Commander', 'Scientist', 'Engineer', 'Alien', 'Robot'], ['No gravity', 'You can see Earth out the window', 'You have to eat carefully', 'Extremely quiet']),
  loc('Pirate Ship', ['Captain', 'Sailor', 'Cook', 'Prisoner', 'Lookout', 'Parrot'], ['It keeps rocking', 'There is a treasure map', 'There are cannons', 'Someone wears an eye patch']),
  loc('Temple Fair', ['Spirit Medium', 'Worshipper', 'Vendor', 'Parade Troupe', 'Temple Keeper', 'Kid'], ['Very loud firecrackers', 'The gods are carried around the streets', 'Strong smell of incense', 'People are carrying a sedan chair']),
  loc('Department Store Sale', ['Sales Clerk', 'Bargain Hunter', 'Security Guard', 'Floor Manager', 'Sample Server', 'Tagalong Family Member'], ['Super crowded', 'Long lines at checkout', 'Free gifts when you spend enough', 'Credit cards maxed out']),
  loc('Hot Spring', ['Bather', 'Owner', 'Masseuse', 'Cleaner', 'Tourist', 'Couple'], ['Smells like sulfur', 'Rinse off before going in', 'The water is very hot', 'Especially crowded in winter']),
  loc('Prison', ['Guard', 'Inmate', 'Warden', 'Lawyer', 'Visiting Relative', 'Cook'], ['Bars on every window', 'Everyone wears the same clothes', 'Fixed time for going outside', "You can't just leave"]),
  loc('Zoo', ['Zookeeper', 'Visitor', 'Vet', 'Kid', 'Tour Guide', 'Photographer'], ['Lots of cages', 'There is a certain smell', 'School field trips are common', "Don't feed the animals"]),
  loc('Beach', ['Lifeguard', 'Surfer', 'Vendor', 'Sunbather', 'Kid', 'Diving Instructor'], ['Very hot', 'Put on sunscreen', 'You can hear the waves', 'Sand gets in your shoes']),
  loc('Library', ['Librarian', 'Student', 'Volunteer', 'Exam Taker', 'Book Club Member', 'Sleeper'], ['Extremely quiet', 'So many books', 'Seats are hard to get before exams', 'The AC is very strong']),
  loc('Police Station', ['Police Officer', 'Suspect', 'Person Filing a Report', 'Chief', 'Reporter', 'Lawyer'], ['You give a statement', 'Someone is arguing', 'Everyone is in uniform', 'You can come to report a crime']),
  loc('Hair Salon', ['Stylist', 'Assistant', 'Customer', 'Shampoo Assistant', 'Owner', 'Waiting Customer'], ['Hair dryers running nonstop', 'You get your hair washed first', 'They take a photo when you are done', 'People read magazines while waiting']),
  loc('Dental Clinic', ['Dentist', 'Assistant', 'Patient', 'Kid', 'Receptionist', 'Parent'], ['The sound of drilling', 'You have to open your mouth wide', 'Lots of people are scared to come', 'You need regular checkups']),
  loc('Farmers Market', ['Vendor', 'Grocery Shopper', 'Fishmonger', 'Butcher', 'Kid', 'Cleaner'], ['The ground is wet', 'Someone is shouting prices', 'Busiest in the morning', 'You can haggle']),
  loc('Concert', ['Singer', 'Fan', 'Security Guard', 'Crew Member', 'Ticket Scalper', 'Dancer'], ['Super loud', 'Everyone is holding glow sticks', 'Tickets sell out fast', 'People shout for an encore']),
  loc('Campground', ['Campsite Owner', 'Camper', 'Kid', 'Griller', 'Dog', 'Hiker'], ['You pitch a tent', 'You can see the stars at night', 'Lots of mosquitoes', 'You need to start a fire']),
  loc('Esports Tournament', ['Player', 'Coach', 'Caster', 'Spectator', 'Referee', 'Fan'], ['Screens everywhere', 'Keyboards clacking nonstop', 'Loud cheering', 'There is prize money']),
  loc('Wedding Photo Studio', ['Photographer', 'Couple', 'Stylist', 'Assistant', 'Bridal Shop Clerk', 'Lighting Tech'], ['You keep changing outfits', 'Lots of bright lights', 'You have to keep smiling', 'Romantic backdrops']),
  loc('Bubble Tea Shop', ['Clerk', 'Customer', 'Delivery Driver', 'Owner', 'Part-Timer', 'Taste Tester'], ['You pick your sugar and ice level', 'The line is long', 'You can add tapioca pearls', 'A machine is sealing cups']),
  loc('Bullet Train', ['Conductor', 'Passenger', 'Cart Attendant', 'Business Traveler', 'Student', 'Backpacker'], ['Very fast', 'Reserved seats', 'A cart sells lunch boxes', 'Very quiet']),
  loc('Hotel', ['Receptionist', 'Guest', 'Doorman', 'Housekeeper', 'Manager', 'Bellhop'], ['You have to check in', 'All-you-can-eat breakfast', 'The bed is huge', 'Check out before noon']),
];

// bot 提問用的通用問題
export const QUESTIONS_EN = [
  'Do you think it gets crowded here?',
  'How often do you come here?',
  'Is it a good place to bring kids?',
  'What do you usually wear here?',
  'How does it smell here?',
  'Does it cost a lot to come here?',
  'Is it noisy here?',
  'Do you feel safe here?',
  'What time are you usually here?',
  'What do you do most often here?',
];

// 間諜 bot 被問時的通用回答
export const SPY_ANSWERS_EN = [
  "It depends. It's different every time.",
  "It's fine. I haven't really paid attention.",
  'Good question, let me think...',
  'About the same as usual.',
  'Could be busy, could be empty.',
  "I don't come often, so I'm not sure.",
  'Depends on when.',
  "Shouldn't you be asking yourself that?",
];
