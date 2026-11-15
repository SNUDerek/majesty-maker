VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 2
-> END

// Bellatores arc: Sebastian (squire), Ser Bedivere (hedge_knight), Baldwin (watch_captain).
// Draft: docs/dialog-drafts/estate-arc-sebastian-bellatores.md

=== knight_1 ===
# title: The Hedge Knight
# order: 10
# activity: hedge_knight
The courtyard smells of dry dust and rusted iron. Ser Bedivere leans on a chipped broadsword, adjusting a dented breastplate.
hedge_knight: Footwork, girl! In my prime, I held the vanguard at the Siege of Oakhaven. Thirty men broke against my shield! # right: hedge_knight
squire: Thirty half-starved farmers, maybe. A real knight would have ended the siege in an hour.
{ bellatores > 20:
    You easily parry the practice dummy, your swing carrying the heavy weight of natural talent.
- else:
    You stumble over your own boots, barely managing to lift the heavy wooden practice sword.
}
scion: (He's arrogant, but his stance is flawless. I suppose that makes him the Squire I was told about.)
* [Confident]
    scion: I'm sure you could have ended it in half an hour, Sebastian. Try not to trip over your ego.
* [Polite]
    scion: I am just a beginner. I look forward to learning from both of you.
- squire: Just try to keep up, country girl. The blade doesn't care about your feelings.
-> END

=== knight_2 ===
# title: The Guard Captain
# order: 20
# activity: village_watch
The armory is freezing. Baldwin, the Guard Captain, paces before the night watch, his face like carved stone.
watch_captain: The law is the wall that keeps the beasts out. The moment you show leniency, the wall cracks. # right: watch_captain
{ fatigue > 30:
    Your muscles ache from training. The heavy chainmail vest Baldwin hands you feels like a lead coffin.
- else:
    You stand at attention, the weight of the chainmail feeling like a comforting layer of armor.
}
scion: (No exceptions. No mercy. It sounds less like keeping the peace and more like waging a war.)
* [Dutiful]
    scion: Understood, Captain. The law is absolute.
* [Inquisitive]
    scion: But what if the law is unjust to begin with, Captain?
- watch_captain: The law isn't there to be fair. It is there to be obeyed. Take your halberd and get to the perimeter.
-> END

=== knight_3 ===
# title: The Sparring Match
# order: 30
# activity: hedge_knight
Wood cracks against wood. Sebastian feints, then aggressively shoves you to the dirt with his shield, ignoring the rules of the drill.
hedge_knight: Hold! That was a reckless strike, boy! You left your flank completely exposed just to land a heavy blow. # right: hedge_knight
squire: A dead enemy can't exploit an open flank, old man. Overwhelming force is the only tactic that actually wins battles.
{ bellatores > 35:
    scion: You only knocked me down because I expected you to fight with honor.
- else:
    You wince, rubbing your bruised shoulder.
    scion: Did you have to hit that hard?
}
scion: (He's treating a sparring match like a fight to the death. He thinks fear is the same as respect.)
* [Combative]
    scion: If you fight like a rabid dog, you'll eventually be put down like one.
* [Analytical]
    scion: Brute force works in a duel. It doesn't work when you have to hold a line with allies.
- squire: When I'm a knight, my allies won't need to hold the line. They'll just need to watch me win.
-> END

=== knight_4 ===
# title: The Harsh Patrol
# order: 40
# activity: village_watch
The midnight patrol. Sebastian catches a terrified, shivering baker rushing across the street past curfew.
squire: Curfew broke an hour ago. The fine is three silvers, or a night in the stocks. # right: squire
{ laboratores > 30:
    scion: Look at his hands, Sebastian. He's covered in flour. He fell asleep at the ovens.
- else:
    scion: Sebastian, he's shaking. He doesn't even have a copper to his name.
}
baker: Please, my lord. If I don't fire the morning bread, my family starves.
scion: (He's just a man trying to survive. But Sebastian is looking at him like an enemy combatant.)
* [Pull rank]
    scion: Let him go, Sebastian. That's an order. We aren't thugs.
* [De-escalate]
    scion: He isn't a threat. Escort him home and count it as a warning.
- squire: Fine. Go. But remember, the law is the only reason people like you don't slit each other's throats!
-> END

=== knight_5 ===
# title: The King's Deer
# order: 50
# activity: village_watch
Deep in the king's woods. You and Sebastian corner a ragged man butchering a poached deer. Sebastian draws his blade.
squire: Poaching the King's deer is a maiming offense. Hold out your hand, thief. # right: squire
{ bellatores > 50:
    You step between them, your hand resting on your own pommel. You are faster than him, and he knows it.
- else:
    You step in front of the poacher, using your own body as a shield against Sebastian's blade.
}
scion: He's starving, Sebastian! Look at his ribs. You aren't maiming him for a deer!
squire: If he walks away, the law is a joke! He stole! There must be a consequence, or the whole realm falls apart!
scion: (He's right. The law has to mean something. But a maimed man can't feed his family. There has to be a balance.)
* [The compromise]
    scion: He owes a debt for the deer. He will work it off in the stables, repairing the stalls.
* [The atonement]
    scion: Take the meat to the orphanage. Give up your bow. The law is satisfied.
- Sebastian slowly lowers his sword. He looks at the trembling man, then at you, finally understanding the difference between cruelty and justice.
-> END

=== knight_6 ===
# title: The Shield, Not the Sword
# order: 60
# activity: hedge_knight
# reward: item gambeson
Back in the courtyard. The sun is setting. Sebastian is meticulously polishing his training gear.
hedge_knight: A knight is a shield, boy. Not a sword. The sword is just the tool we use when the shield isn't enough. # right: hedge_knight
squire: I... I understand that now, Ser Bedivere.
{ bellatores + oratores + laboratores > 80:
    Sebastian turns to you, dropping his arrogant posture entirely. He bows his head in genuine respect.
- else:
    Sebastian refuses to meet your eyes out of embarrassment, but his voice is entirely sincere.
}
squire: I thought being strong meant I was always right. But in the woods... you were the strong one.
scion: (He really is trying to be better. He's going to make a fine knight someday.)
* [Gracious]
    scion: We both learned something out there. Let's just focus on the future.
* [Playful]
    scion: Just don't forget who stopped you. Try to keep up, Sebastian.
- squire: I'll hold you to that. Before you leave on your Pilgrimage, take this. It's a Leather Gambeson. It saved my life once. Let it save yours.
-> END
