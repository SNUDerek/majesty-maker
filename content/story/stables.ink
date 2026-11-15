VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 3
-> END

// Stables side route: Olaf (stablemaster).
// Draft: docs/dialog-drafts/estate-arc-stablemaster.md

=== stables_1 ===
# title: The Misfire
# order: 10
# activity: stables
The stables smell sharply of hay and manure. Olaf is leaning on a pitchfork, watching you painstakingly groom a massive draft horse.
stablemaster: You know how to tell the difference between a high-born Lord and this draft horse here? # right: stablemaster
{ fatigue > 30:
    Your arms are burning from lifting water buckets. You pause, wiping sweat from your brow.
- else:
    You keep brushing the horse's flank with measured, practiced strokes, trying to maintain your 'noble' composure.
}
scion: I don't know, Olaf. How?
stablemaster: The horse only produces manure from one end!
scion: (He's testing me. Ser Bedivere says a ruler must command respect, and Diogenes says a ruler must stay above the mud. I shouldn't laugh at a joke mocking lords.)
* [Stiff]
    scion: That is incredibly disrespectful to the King's bannermen, Olaf.
* [Play dumb]
    scion: I... do not understand the comparison. Horses eat hay.
- Olaf rolls his eyes, muttering under his breath as he goes back to shoveling.
stablemaster: Right. Sorry, milady. Didn't realize I was working with a saint. Back to it, then.
-> END

=== stables_2 ===
# title: The Icebreaker
# order: 20
# activity: stables
It is pouring rain outside. The stables are gloomy. Olaf is nursing a bruised shin where a horse kicked him, looking thoroughly miserable and surly. # right: stablemaster
{ melancholy > 40:
    The pressure of your classes has been crushing you all week. The tension in the air is unbearable.
- else:
    The silence in the barn is deafening. You decide you are tired of acting perfectly proper all the time.
}
scion: (He hasn't said a word to me in an hour. It's time to drop the 'future queen' act before I lose my mind.)
scion: I have a riddle for you, Olaf. From an old book.
stablemaster: Not in the mood for high-born poetry today.
* [Deadpan]
    scion: It hangs by a man's thigh, stiff and hard. He pulls up his cloak and sticks the head of it into a familiar hole.
* [Theatrical]
    scion: I am a wondrous thing, pierced in the front! I hang under my master's cloak, waiting for the matching hole!
- Olaf drops his pitchfork. His jaw hits the hay-covered floor. He stares at you in absolute, wide-eyed horror.
stablemaster: Uh... milady?!
scion: It's a door key, Olaf. Get your mind out of the gutter.
Olaf blinks, processes the joke, and suddenly bursts into a booming, wheezing laugh that scares the horses.
-> END

=== stables_3 ===
# title: The Camaraderie
# order: 30
# activity: stables
# reward: item metheglin
You and Olaf are working side-by-side, rapidly clearing out the last of the dirty straw. The work is hard, but the mood is light.
stablemaster: ...So the Abbot says, 'That's not a miracle, that's just the miller's wife!' # right: stablemaster
{ laboratores > 30:
    You laugh so hard you have to lean on your pitchfork to keep from falling over into the hay.
- else:
    You stifle a snort, shaking your head at how utterly ridiculous the two of you must look.
}
scion: (I spend all week worrying about the Conjunction, the Usurper, and the destiny of the realm. But in here, I'm just a person.)
* [Sincere]
    scion: Thank you, Olaf. I really needed the laugh today.
* [Banter]
    scion: If you put half as much effort into shoveling as you do into your jokes, we'd be done by now.
- stablemaster: Hey, keeping morale high is hard labor! You're alright, kid. For a stick-in-the-mud.
Olaf tosses you a stoppered clay flask of metheglin. It's cheap stuff, but it represents a moment of true levity.
-> END
