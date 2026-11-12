## 1. Concept

This is a Princess Maker type "raising up simulation", similar to modern games like Gust's Atelier games and the Persona games. The main focus is a time-management sim, where the player must schedule activities to help grow their characters in order to overcome the final obstacle at the end of the allotted time. The in-game conceit is that the player is raising their adoptive daughter to become the princess (hence, Princess Maker).

Time is split into months and weeks. Each week, the player can assign the daughter to one activity: doing a job to earn currency, studying to increase stats, socializing with friends to build relationships, resting to reduce fatigue, or adventuring, which sees the daughter (and her companions, usually) participate in some RPG type gameplay in order to further the story and make progress towards overcoming the final encounter.

This is a POC meant to implement this basic game loop, including a simplified adventuring mechanic. it is meant to be more closely medieval-themed than the Princess Maker games, which take place in a variety of magical settings. while taking place in either a mythological Europe or a fantasyland heavily based on medieval Europe, as a side note, I want to avoid explicit references to Christian figures like Jesus, Mary, the Holy Cross, and specific saints. referring to other religious items such as saints in general, churches, relics, etc. is fine.

### Narrative Frame: The Hidden Scion and the Great Conjunction

The game merges grounded medieval history with Arthurian myth. Ten years ago, a Vortigern-like Usurper slaughtered the royal family and seized the throne. The player acts as the fiercely loyal seneschal who smuggled the infant heir into the rural borderlands, raising her in obscurity. As she reaches adolescence, the stars align in a Great Conjunction. A vision from a martyred saint (or Merlin-esque mystic) reveals that she must undertake a sacred journey along the Pilgrim’s Road to the capital to claim her destiny.

How the player raises her—focusing on the martial, the spiritual, or the mercantile—determines her path to the throne. She will not arrive alone; the allies and factions she aids along the pilgrimage will rally in an "Endgame-style" climax to lay siege to the Usurper. The aesthetic relies strictly on 15th-century woodcut art (ala the Nuremberg Chronicle), utilizing authentic medieval music and minimal, illuminated-manuscript UI elements.

### The Opening Sequence (Storyboard)

**Scene 1: The Fall (Exposition)**

* **Visual:** A stark, black-and-white woodcut of a castle burning under a jagged, stylized comet.
* **Text (Slowly typing out in a Gothic font):** "Ten years ago, the Usurper's blade severed the royal line. But the astrologers lied to him. One child was smuggled into the deep woods. Placed in your hands."

**Scene 2: The Alignment (The Setup)**

* **Visual:** The scene fades to a crude woodcut of a humble, thatched manor. Above it, the sky is filled with a dense, rotating chart of zodiac symbols. The rain audio softens.
* **Text:** "You have hidden her well. But you cannot hide her from the heavens. The Great Conjunction has arrived."

**Scene 3: The Call (The Vision)**

* **Visual:** A sudden flash of Red and Blue ink (the first color in the game). A spectral, crowned figure—perhaps a martyred saint or a Merlin-esque hermit—appears over the girl's bed.
* **Text:** "The stars align. The Usurper's throne rots. She must walk the Pilgrim’s Road to the capital, or the realm will fracture forever."

**Scene 4: The Hand-off (Gameplay Begins)**

* **Visual:** The player's dark, cluttered study. The girl (now a teenager) stands by the door, wearing a simple wool cloak, waiting for instructions.
* **Text:** "The road is perilous. She is not ready. You have exactly [X] months to prepare her. What is her first task?"
* *The UI fades in, and the player is dropped straight into the initial setup.*

### Initial setup

after the narrative, the player needs to establish a few things:

- player name (first and last)
- daughter's name (first)
- daughter's star sign (based on western zodiac)

for the POC, the game starts on the daughter's birth month. For the demo, it can be her 14th birthday, and she needs to complete the pilgrimage by 16 (roughly when Joan of Arc set out on her adventures). the starting year can be whatever, let's say 1450.

## 2. The Three Estates: Classes, Jobs, and Social Systems

The core gameplay loop centers on managing time, currency (Coin), and two negative conditions: **Fatigue** (physical exhaustion) and **Melancholy** (spiritual/mental stress). All progression is categorized by the societal pillars of the Middle Ages.

### Core Stats:

* **Bellatores (Those Who Fight):** Martial prowess, force, and physical resilience. (Red UI accents)
* **Oratores (Those Who Pray):** Faith, scholasticism, and mystical arts. (Blue UI accents)
* **Laboratores (Those Who Work):** Cunning, craftsmanship, and street survival. (Green UI accents)

They are in a Rock-Paper-Scissors relationship:

* Bellatores beat Laboratores (use of force, noble stature)
* Laboratores beat Oratores (the church needs supplies; dirty tricks fool the scholars)
* Oratores beat Bellatores (the church nominally controls the nobility; godly over worldly authority)

All stats (Bellatores, Oratores, Laboratores) and "health" (Fatigue, Melancholy) are in 0-100 range.

All three starting stats start at 15, with +5 stat boost based on birth zodiac.

Coin is capped at 9,999 and starts at 50.

### Conditions:

There are two conditions: Fatigue (physical tiredness) and Melancholy (boredom, depression).

Fatigue and Melancholy start at zero and points are accrued by working or studying, and reduced by resting; when the bar is maxed out, the player collapses and must immediately rest to recover.

Fatigue and Melancholy are in 0-100 range but have a lower starting cap that raises with stat gain:

```
Max Fatigue = 75 + (Bellatores − 15) / 2, clamped between 75 ~ 100
Max Melancholy = 75 + (Oratores − 15) / 2, clamped between 75 ~ 100
```

NOTE: visually, on the UI, show the full 100-level bar, and show the reduced cap as a greyed-out section, like Elden Ring debuffs.

The Laboratores stat does not affect Fatigue or Melancholy, instead it affects a "Purse Protection" stat that reduces money lost to failed Laboratores approaches and Pilgrimage wipeouts, calculated as:

```
Purse Protection Rate = stat / 200  # half of stat value, as percent
```

math note: all values rounded down to nearest integer.

**Astrological sign bonus**

* Cardinal signs (initiating: Aries, Capricorn, Libra, Cancer) → Bellatores
* Fixed signs (steadfast: Leo, Taurus, Aquarius, Scorpio) → Oratores
* Mutable signs (adaptable: Sagittarius, Virgo, Gemini, Pisces) → Laboratores

### Classes (Tutors)

*Mechanic: Costs Coin, guarantees stat increase, generates moderate Fatigue/Melancholy and reduces another stat slightly.*

* **The Hedge Knight (Bellatores):** A scarred veteran teaching swordplay in the courtyard. Slightly lowers Laboratores.
* **The Hermit (Oratores):** A secluded mystic teaching Latin, astrology, and ancient rites. Slightly lowers Bellatores.
* **The Smuggler (Laboratores):** A pragmatic rogue teaching lockpicking, haggling, and stealth. Slightly lowers Oratores.

All tutor sessions apply: −20 Coin, +5 stat, −1 to the opposing stat, +5 condition

### Part-Time Jobs

*Mechanic: Costs time, requires a d100 stat check. Success yields Coin and minor stat growth; failure yields no Coin and double negative conditions.*

* **The Stables (Starter Job):** Cleaning the stables. Guaranteed success, low Coin, balanced condition drain (lower than the others). 
* **The Alehouse (Laboratores):** Serving drinks and avoiding brawls. Variable Coin (tips), balanced condition drain.
* **The Village Watch (Bellatores):** Patrolling for poachers. High Fatigue generation.
* **The Scriptorium (Oratores):** Copying manuscripts for the local abbey. High Melancholy generation.

Except stables, all job checks are rolled against stat + 35, clamped to 5–95%. Stables is auto-success.

Payouts: 

Stables: +6 Coin, +1 Laboratores, +2 Fatigue and +2 Melancholy.
Alehouse: Success: +10 + 1d10 Coin, +2 Laboratores, +5 Fatigue. Failure: +0 Coin, +5 Fatigue & +5 Melancholy
Village Watch: Success: +15 Coin, +2 Bellatores, +5 Fatigue. Failure: +0 Coin, +10 Fatigue
Scriptorium: Success: +15 Coin, +2 Oratores, +5 Melancholy. Failure: +0 Coin, +10 Melancholy

The narrative justification for these jobs: you are hiding the true heir to the throne in a rural border-fief. To maintain her disguise and fund her eventual pilgrimage, she must blend in and work among the commoners. This grounds her in the realities of her kingdom while organically building the stats she needs.

### Companions (NPCs)

*Mechanic: Spending time with them requires checks for a successful 'date'. Building the relationship track unlocks items (later, they should be playable in a more fleshed out RPG-style adventuring mechanic).*

* **The Squire (Bellatores):** A young noble scion
* **The Heretic Novice (Oratores):** A runaway monk
* **The Urchin (Laboratores):** A local thief

Note: social encounters ('dates') are not pass-fail. Instead, the roll should determine how much progress is made in the relationship, with a modifier based on the relevant stat (tbd whether flat bonus or multiplier). for the initial POC, let's not implement social mechanics yet; we will add them in next phase, along with a more complicated final encounter, and multiple endings.

### Rest & Recovery

*Mechanic: Spends Coin to clear negative conditions.*

* **Rest at Home:** free (no Coin reduction); small reduction in Fatuge and Melancholy (-15 each)
* **The Bathhouse:** -15 Coin; -40 Fatigue & -10 Melancholy.
* **The Shrine:**  -15 Coin (donation); -10 Fatigue & -40 Melancholy.
* **The Banquet:** A lavish feast at the high table. −30 Coin; -35 Fatigue & -35 Melancholy.

## 3. The Pilgrimage: Adventuring Loop

The adventuring system is a tabletop-inspired probability oracle representing the perilous journey to the capital. The route is divided into segments punctuated by **Waystations** (abbeys and hospices). To reach a Waystation, the player must survive a gauntlet of exactly *N* encounters (e.g., 5 encounters/cards). To go on a Pilgrimage, you must assign the amount of Coin to carry on you before you leave (including 10 Coin spent on the preparations), and each waystation takes one week to reach. Once you've reached a waystation, you can decide to continue, or turn around. You always start a Pilgrimage session at the furthest waystation reached (this is a gameplay concession). 

**Road Bonus**

There is a roll bonus applied when heading out from a Waystation: +40 on the first segment, falling linearly to +0 on the last/ the final gauntlet goes negative. In-game, this could reflect how refreshed you are for setting out.

**The Encounter Check:**

1. **Draw:** An encounter card is drawn, visually telegraphed by a rubricated border (Red/Bellatores threat, Blue/Oratores threat, Green/Laboratores threat).
2. **Approach:** The player chooses an Estate to respond with. This creates a Rock-Paper-Scissors advantage modifier (e.g., Bellatores brute-forces a Laboratores obstacle for a 1.5x stat multiplier). The approach also determines which bar absorbs a failure: A Bellatores approach accrues Fatigue, Oratores accrues Melancholy, and Laboratores costs Coin.
3. **Roll:** A d100 is rolled under the modified stat. Success yields progress and minor loot; failure inflicts -15 to Fatigue, Melancholy, or Coin loss depending on the approach (doubled at Full Moon).

Roll calculation: stat × approach multiplier (advantage 1.5 / neutral 1.0 / disadvantage 0.75) + road bonus, clamped to 5–95%.

Success: random and/or card-based effect (Coin, minor Condition reduction, item, etc.). For now just +1d4 Coin.

Failure does NOT halt or lose progress along the Pilgrimage path. In universe, you take your knocks and press on. You just need to 'survive' the N encounters until the next waystation without maxing out Fatigue or Melancholy, pass or fail.

**The Push-Your-Luck Resolution:**
After every encounter, the player must decide to press on or retreat, managing their condition bars against the remaining distance to the next Waystation.

* **Reach Waystation:** Survive all 5 encounters. The route is secured. The player keeps all loot, suffers no time penalty, and unlocks fast-travel safe passage back to the home estate (e.g. they safely travel back with a merchant caravan or get an escort). They can choose to continue on to the next waystation (which takes another week) or return home. Thematic Logic (The Abbey/Hospice): In the Middle Ages, long-distance travel relied on a network of fortified abbeys, monasteries, and chartered hospices specifically built to shelter pilgrims (such as the Knights Hospitaller). Once the character reaches one, they are under the protection of sacred hospitality. They can securely bank their findings, rest in safety, and join a heavily guarded merchant caravan or river barge heading back to their home estate for free.
* **Make Camp (Retreat):** Turn back early. The player loses a portion of their run-specific loot and pays a Coin toll to safely return, but loses no calendar time (beyond the current week). The partial progress is lost. Thematic Logic (The Guide's Toll): The character is stranded in the untamed wilderness (the medieval woods were notoriously dangerous, full of outlaws and wolves). To get home safely without reaching the Abbey, they have to abandon their path and hire an unsavory local tracker, bribe a toll-bridge guard, or barter their newly acquired goods to a passing merchant for a ride back. It is a desperate, expensive scramble back to civilization.
* **Wipeout:** Fatigue or Melancholy reaches max cap. or player cannot pay the required Coin (the previous encounter failure penalty would have reduced carried Coin past zero into negatives). The character collapses and is dragged home. The player loses all run loot and carried Coin (attenuated by the Purse Protection rate), pays heavy medical Coin penalties (-50 Coin from the total Coin, not carried Coin), and loses a full week of scheduling time to bed rest (if 50 Coin would put total Coin in the negative, set it to zero instead). Thematic Logic (The Convalescence): The character collapses on the road. They are either beaten and robbed by footpads, succumb to a sudden fever, or suffer a total nervous breakdown from terror. They are found unconscious by a passing cart and hauled back to the home estate. The currency loss pays the hefty surgeon or apothecary bills (leechcraft, poultices). The time loss represents mandatory bed rest, costing the player a valuable week of scheduling and stat-building.

note on continuing from a waystation: continuing from a waystation does not require another 10 Coin setup fee, that is paid only when setting out initially from home base. mechanically, there is a slight possibility for cheesing by 'returning' to restock consumables and set out again immediately, but the gold payment to set out on pilgrimage would need to be paid again.

## 4. Astrological Integration (The Celestial Engine)

The player chooses the Scion’s birth month (Zodiac Sign) at the start of the game, locking in her Solar Aspects, while the Lunar Phases act as a global weekly cycle.

The status and effects of both the solar and lunar aspects should be easily visible where required, and the player should get reminders before critical periods such as solar Conjunction and Opposition.

### System 1: The Solar Aspects (The Monthly Macro)

The Solar Aspect system compares the current in-game month to the character's birth month. It dictates the broad efficiency of **Classes (Tutors)** and **Jobs** for that entire 4-week period.

* **Solar Return (Birthday Month - 0 distance):** *Peak Vitality.* All Classes yield +20% stat gains. The Banquet rest action costs 50% less Coin (framed as birthday gifts/tributes).
* **Opposition (6 Months from Birthday):** *Maximum Friction.* All Jobs generate 1.5x Fatigue and Melancholy. The player must rely heavily on Rest actions or banked Coin to survive this month without wiping out.
* **Trine (4 or 8 Months - Elemental Harmony):** *Natural Flow.* Success rates on all d100 Job checks gain a flat +15% bonus.
* **Square (3 or 9 Months - Forced Growth):** *Crucible.* Classes yield +30% stat gains, but also generate double the normal Melancholy, representing the immense pressure of rapid development.

### System 2: The Lunar Phases (The Weekly Micro)

While the Sun governs the month-long stat modifiers, the Moon governs the week-to-week tactical execution, heavily influencing **Rest Actions** and the **Pilgrimage**.

* **Week 1: New Moon (Concealment):** *The Unseen.* Laboratores activities (The Smuggler, The Alehouse) gain a bonus. On the Pilgrimage, the player can pay a small Coin fee to "bribe/sneak" past one encounter card per route without rolling.
* **Week 2: Waxing Moon (Momentum):** *Building Force.* Doing the exact same Job or Class as the previous week applies a compounding 1.1x multiplier to the payout/stat gain.
* **Week 3: Full Moon (Culmination):** *Volatility.* Oratores and Bellatores activities surge. On the Pilgrimage, RPS Advantage multipliers are doubled (from 1.5x to 2.0x), but taking damage deals double Fatigue/Melancholy. It encourages high-risk, high-reward adventuring.
* **Week 4: Waning Moon (Release):** *Recovery.* All Rest Actions (Bathhouse, Shrine, Banquet) clear 1.5x more Fatigue and Melancholy, encouraging the player to use Week 4 for recovery.

## 5. Items

Items can be granted from making progress on social tracks or gained randomly as encounter rewards. There are two classes of items, consumables and equipment. Consumables provide some immediate benefit such as as stat increase, condition (Fatigue/Melancholy) reduction, or opportunity to reroll an encounter. Equipment provides bonuses and buffs. Both item classes can ONLY be used during Pilgrimages. The user can bring one eqipment and one consumable on each Pilgrimage. Items should be rare, endgame items. Consumables are lost on wipeout (equipment is not).

### Consumables

consumables serve as "safety nets" while traveling and add complexity to the push-your-luck mechanic:

* Theriac : reduces Fatigue by 30
* St. John's Wort : reduces Melancholy by 30
* Metheglin : allows a re-roll in a Pilgrimage Encounter

(the Metheglin is maybe a slight deviation from theme, but from wht I could find, there are not many consumable medieval good luck charms. It's a personal inclusion, since I like homebrewing mead, and also it's my nod to Kingdom Come Deliverance's Savior Schnapps, another alcohol with important gameplay effects.)

Theriac and St. John's Wort can be used between encounters. Metheglin must be used immediately after a failed encounter roll.

### Equipment

equipment provides passive buffs and effects on Pilgrimages when carried in the inventory (For now, there is no "paper doll" equipping; to gain an item's effects, it just needs to be in the pouch).

* Gambeson : on a failed Bellatores approach, Fatigue penalty is reduced by 5.
* Saint's Relic : when facing an Oratores-coded threat (blue encounter card), +10 to roll result.
* Weighted Coin : on a failed Laboratores approach, lose half as much Coin

## 6. The Ending

for initial POC, the final encounter is just do another Pilgrimage round, with high number of encounters and negative Road bonus. it can be attempted any time once it's reached at the end of the Pilgrimage, and can be re-attempted until time runs out (two years = 24 months x 4 weeks = 96 turns). see next section for future plans.

## 7. Future Developments: 

### Deeper Characterization

There is some narrative tension about how parents may bend the will of their child to achieve their own dreams, and about how independent the daughter is. We can flesh this out alongside the NPC friend social interactions, while developing the dialog system more.

### Social Interactions

Add social tracks and rewards for progress. Then, add actual story encounters with custom branching dialogs and decisions that affect the progress.

### Richer Ending 

Create a custom final encounter, ideally one that utilizes skill checks from all three estates, incorporates the NPCs, and brings narrative closure. add multiple endings based on stats, NPC relations, and success in the final encounter.

### Festivals and The Physician

While omitted from this initial proof-of-concept, two staples of the raising-simulator genre are reserved for future integration:

* **Festivals:** These will act as fixed seasonal calendar events rather than standard rest actions. They will offer unique mini-games, timed rewards, and major narrative boosts for NPC relationships based on the time of year.
* **The Physician:** Rather than a simple rest action, the Galenic physician will be tied to a dedicated disease system. If the player chronically neglects the character's humors—allowing conditions to max out outside of the Pilgrimage—she will fall ill, requiring the physician for specific, costly historical treatments (e.g., bloodletting) to cure persistent debuffs.
