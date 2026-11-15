VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 2
-> END

// Laboratores arc: Nicole (urchin), Hancock (smuggler), Helga (alewife).
// Draft: docs/dialog-drafts/estate-arc-nicole-laboratores.md

=== alley_1 ===
# title: The Smuggler
# order: 10
# activity: smuggler
The cellar is damp and smells of river water. Hancock deftly flicks a pair of lockpicks, popping a heavy iron padlock open in seconds.
smuggler: The lock only keeps honest folks out. In this world, you take what you can carry, and you never look back. Everyone else is doing the same. # right: smuggler
urchin: Don't listen to him, he's full of it! He gave half his last take to the orphanage.
{ laboratores > 20:
    You take the picks from Hancock and mimic his wrist movement, popping the second lock with a satisfying click.
- else:
    You fumble with the tension wrench, accidentally jamming it deep into the rusted keyhole.
}
scion: (Nicole hasn't changed at all. She still has dirt on her cheek and that same bright, mischievous grin from when we were kids.)
* [Playful]
    scion: I see you're still keeping the local criminals in line, Nicole.
* [Pragmatic]
    scion: Hancock might be right, Nicole. You have to look out for yourself.
- smuggler: Listen to the princess. She gets it. Now, try the deadbolt. And don't break my tools.
-> END

=== alley_2 ===
# title: The Alewife
# order: 20
# activity: alehouse
The tavern is a wall of noise, heat, and spilled ale. Helga navigates the chaos perfectly, balancing four massive wooden tankards on one arm.
alewife: Keep your head on a swivel! Don't let the mercenaries pinch you, don't water down the regulars' drinks, and if a fight breaks out, save the good chairs first! # right: alewife
{ fatigue > 30:
    Your feet are dragging. The noise makes your head pound, and a sloshing tankard nearly slips from your grip.
- else:
    You weave through the crowded tables with practiced ease, sliding the drinks perfectly to the thirsty patrons.
}
scion: (It's absolute pandemonium. Hancock said everyone is out for themselves, but Helga seems to know everyone's name and exactly what they need.)
* [Overwhelmed]
    scion: How do you keep track of all this without losing your mind, Helga?
* [Admiring]
    scion: It's like you're commanding an army, but with stew and ale.
- alewife: We take care of our own down here! Now stop gawking and get table four their mutton!
-> END

=== alley_3 ===
# title: The Widening Gap
# order: 30
# activity: alehouse
The tavern is quiet after the lunch rush. You and Nicole are wiping down the sticky tables.
urchin: So... I saw you with Ser Bedivere yesterday. You looked like a real knight. Like one of the stories. # right: urchin
{ bellatores > 35:
    scion: He's teaching me the high guard. I think I'm actually going to be leading people someday, Nicole.
- else:
    scion: I'm trying, but it's hard. There is just so much pressure on me right now.
}
urchin: Right. Leading people. Armies, and lords, and... all that.
scion: (She won't meet my eyes. She's aggressively scrubbing a spot on the wood that is already clean.)
* [Oblivious]
    scion: I can't wait to see the capital. My tutors say it's incredible.
* [Reassuring]
    scion: I'm still just me, Nicole. Nothing is going to change that.
- urchin: Sure it is. You're going to go off and be some great hero, or a saint. Why would you even need us peasants anymore?
Nicole throws her rag into the bucket and walks into the kitchen before you can answer.
-> END

=== alley_4 ===
# title: The Con Job
# order: 40
# activity: smuggler
Back in the cellar. Hancock is detailing a scam to short-change a corrupt wool merchant who drinks at Helga's tavern.
urchin: I can do it. I'll bump him, slip his ledger, and she can rewrite the tallies. # right: urchin
smuggler: It's risky, kid. This merchant travels with two heavy-handed guards.
{ laboratores > 40:
    You immediately spot the flaw in the plan. The merchant keeps the ledger on a chain. You'll have to unclip it first.
- else:
    Your heart pounds. You've never actually stolen from anyone before, let alone a wealthy merchant.
}
scion: (She's doing this to prove she's still useful. To prove the streets still have something to teach me. I can't let her do it alone.)
* [Supportive]
    scion: I'm in. But we do it exactly how Hancock says. No improvising.
* [Hesitant]
    scion: Nicole, this is incredibly dangerous. We don't have to prove anything.
- urchin: No, I don't have to prove anything. But I need you to know I've still got your back. Tonight, at the tavern.
-> END

=== alley_5 ===
# title: The Bar Fight
# order: 50
# activity: alehouse
The tavern. The scam goes completely wrong. The merchant catches Nicole by the wrist, and his two massive mercenary guards draw their daggers.
merchant: Filthy little street rat! I'll take your hand for this! # right: merchant
{ bellatores > 50:
    You step forward, falling into a perfect knight's stance, demanding the mercenaries face you with honor.
- else:
    You freeze, trying to remember a prayer or a law that will compel them to stop.
}
scion: Release her! I demand you face me in single combat, you cowards!
The mercenary laughs, completely ignoring your 'noble' challenge. He grabs a heavy wooden chair and swings it right at your head.
scion: (My training... it means nothing here! They don't care about honor or rank!)
* [Desperate]
    scion: Nicole! Help!
* [Improvise]
    Toss a mug of boiling stew directly into the mercenary's face!
- Nicole doesn't hesitate. She kicks the mercenary's knee out, throws a handful of blinding hearth-ash in the merchant's eyes, and yanks you out the back door into the alley.
-> END

=== alley_6 ===
# title: Back to Back
# order: 60
# activity: smuggler
# reward: item weighted_coin
You and Nicole are catching your breath in Hancock's cellar. Helga is there, arms crossed, tapping her foot.
alewife: You two are lucky I swept up the merchant before the town guard arrived. Don't ever pull a stunt like that in my tavern again! # right: alewife
smuggler: I told you it was risky. But... I'm glad you're both in one piece. Really.
{ bellatores + oratores + laboratores > 80:
    Nicole looks at you, seeing the genuine relief in your eyes. The wall between you has finally fallen. # right: urchin
- else:
    Nicole pulls you into a tight, fierce hug, burying her face in your shoulder. # right: urchin
}
scion: (She saved my life. All the tutors in the world couldn't have taught me how to survive that alley.)
* [Humility]
    scion: I was completely useless back there. You were amazing, Nicole.
* [Sisterhood]
    scion: We got out together. Just like when we were kids.
- urchin: You didn't run. You tried to fight them for me. Even if your form was terrible for a bar fight.
urchin: Here. Hancock taught me how to make this. It's a Weighted Coin. Use it to cheat the toll guards on your Pilgrimage. And... come back to us.
-> END
