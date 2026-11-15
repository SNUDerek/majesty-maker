Here is the complete script for the Bellatores (Sebastian) arc. Since the Father is absent for these events, the Daughter acts as the POV character. The `(inner monologue)` and `[CHOICE]` options now reflect her developing worldview, allowing the player to shape how she responds to the burden of strength.

my feedback:

```
i think the main climax and the denoument need to be a little more dramatic, i need to believe sebastian's shift in mindset.
```

---

### Beat 1a: The Hedge Knight (Activity: Bellatores Tutor)

**Narration:** The courtyard smells of dry dust and rusted iron. Ser Bedivere leans on a chipped broadsword, adjusting a dented breastplate.
**Bedivere:** "Footwork, girl! In my prime, I held the vanguard at the Siege of Oakhaven. Thirty men broke against my shield!"
**Sebastian:** "Thirty half-starved farmers, maybe. A real knight would have ended the siege in an hour."
**[CONDITIONAL: if Bellatores > 20]**

* **Then:** **Narration:** You easily parry the practice dummy, your swing carrying the heavy weight of natural talent.
* **Else:** **Narration:** You stumble over your own boots, barely managing to lift the heavy wooden practice sword.

**Daughter:** *(He’s arrogant, but his stance is flawless. I suppose that makes him the Squire I was told about.)*
**Daughter:** [CHOICE]

* **Option A (Confident):** "I'm sure you could have ended it in half an hour, Sebastian. Try not to trip over your ego."
* **Option B (Polite):** "I am just a beginner. I look forward to learning from both of you."

**Sebastian:** "Just try to keep up, country girl. The blade doesn't care about your feelings."

---

### Beat 1b: The Guard Captain (Activity: Village Watch Job)

**Narration:** The armory is freezing. Baldwin, the Guard Captain, paces before the night watch, his face like carved stone.
**Baldwin:** "The law is the wall that keeps the beasts out. The moment you show leniency, the wall cracks."
**[CONDITIONAL: if Fatigue > 30]**

* **Then:** **Narration:** Your muscles ache from training. The heavy chainmail vest Baldwin hands you feels like a lead coffin.
* **Else:** **Narration:** You stand at attention, the weight of the chainmail feeling like a comforting layer of armor.

**Daughter:** *(No exceptions. No mercy. It sounds less like keeping the peace and more like waging a war.)*
**Daughter:** [CHOICE]

* **Option A (Dutiful):** "Understood, Captain. The law is absolute."
* **Option B (Inquisitive):** "But what if the law is unjust to begin with, Captain?"

**Baldwin:** "The law isn't there to be fair. It is there to be obeyed. Take your halberd and get to the perimeter."

---

### Beat 2: The Sparring Match (Activity: Bellatores Tutor)

**Narration:** Wood cracks against wood. Sebastian feints, then aggressively shoves you to the dirt with his shield, ignoring the rules of the drill.
**Bedivere:** "Hold! That was a reckless strike, boy! You left your flank completely exposed just to land a heavy blow."
**Sebastian:** "A dead enemy can't exploit an open flank, old man. Overwhelming force is the only tactic that actually wins battles."
**[CONDITIONAL: if Bellatores > 35]**

* **Then:** **Daughter:** "You only knocked me down because I expected you to fight with honor."
* **Else:** **Daughter:** You wince, rubbing your bruised shoulder. "Did you have to hit that hard?"

**Daughter:** *(He’s treating a sparring match like a fight to the death. He thinks fear is the same as respect.)*
**Daughter:** [CHOICE]

* **Option A (Combative):** "If you fight like a rabid dog, you'll eventually be put down like one."
* **Option B (Analytical):** "Brute force works in a duel. It doesn't work when you have to hold a line with allies."

**Sebastian:** "When I'm a knight, my allies won't need to hold the line. They'll just need to watch me win."

---

### Beat 3: The Harsh Patrol (Activity: Village Watch Job)

**Narration:** The midnight patrol. Sebastian catches a terrified, shivering baker rushing across the street past curfew.
**Sebastian:** "Curfew broke an hour ago. The fine is three silvers, or a night in the stocks."
**[CONDITIONAL: if Laboratores > 30]**

* **Then:** **Daughter:** "Look at his hands, Sebastian. He's covered in flour. He fell asleep at the ovens."
* **Else:** **Daughter:** "Sebastian, he's shaking. He doesn't even have a copper to his name."

**Baker:** "Please, my lord. If I don't fire the morning bread, my family starves."
**Daughter:** *(He's just a man trying to survive. But Sebastian is looking at him like an enemy combatant.)*
**Daughter:** [CHOICE]

* **Option A (Pull Rank):** "Let him go, Sebastian. That's an order. We aren't thugs."
* **Option B (De-escalate):** "He isn't a threat. Escort him home and count it as a warning."

**Sebastian:** "Fine. Go. But remember, the law is the only reason people like you don't slit each other's throats!"

---

### Beat 4: The Climax (Activity: Village Watch Job)

**Narration:** Deep in the king's woods. You and Sebastian corner a ragged man butchering a poached deer. Sebastian draws his blade.
**Sebastian:** "Poaching the King's deer is a maiming offense. Hold out your hand, thief."
**[CONDITIONAL: if Bellatores > 50]**

* **Then:** **Narration:** You step between them, your hand resting on your own pommel. You are faster than him, and he knows it.
* **Else:** **Narration:** You step in front of the poacher, using your own body as a shield against Sebastian's blade.

**Daughter:** "He's starving, Sebastian! Look at his ribs. You aren't maiming him for a deer!"
**Sebastian:** "If he walks away, the law is a joke! He stole! There must be a consequence, or the whole realm falls apart!"
**Daughter:** *(He's right. The law has to mean something. But a maimed man can't feed his family. There has to be a balance.)*
**Daughter:** [CHOICE]

* **Option A (The Compromise):** "He owes a debt for the deer. He will work it off in the stables, repairing the stalls."
* **Option B (The Atonement):** "Take the meat to the orphanage. Give up your bow. The law is satisfied."

**Narration:** Sebastian slowly lowers his sword. He looks at the trembling man, then at you, finally understanding the difference between cruelty and justice.

---

### Beat 5: The Resolution (Activity: Bellatores Tutor)

**Narration:** Back in the courtyard. The sun is setting. Sebastian is meticulously polishing his training gear.
**Bedivere:** "A knight is a shield, boy. Not a sword. The sword is just the tool we use when the shield isn't enough."
**Sebastian:** "I... I understand that now, Ser Bedivere."
**[CONDITIONAL: if Bellatores + Oratores + Laboratores > 80]**

* **Then:** **Narration:** Sebastian turns to you, dropping his arrogant posture entirely. He bows his head in genuine respect.
* **Else:** **Narration:** Sebastian refuses to meet your eyes out of embarrassment, but his voice is entirely sincere.

**Sebastian:** "I thought being strong meant I was always right. But in the woods... you were the strong one."
**Daughter:** *(He really is trying to be better. He's going to make a fine knight someday.)*
**Daughter:** [CHOICE]

* **Option A (Gracious):** "We both learned something out there. Let's just focus on the future."
* **Option B (Playful):** "Just don't forget who stopped you. Try to keep up, Sebastian."

**Sebastian:** "I'll hold you to that. Before you leave on your Pilgrimage, take this. It's a **Leather Gambeson**. It saved my life once. Let it save yours."
