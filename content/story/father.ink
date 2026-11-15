VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 2
-> END

=== father_1 ===
# title: The Restless Fire
# order: 10
# activity: socialize
# month: 1
# bg: home
# left: player
It is well past midnight. You see {scion} in the courtyard, aggressively drilling sword forms by the light of a single lantern. # right: scion
{ fatigue > 50:
    She looks exhausted, bags forming under her eyes, her strikes growing sloppy from sheer exertion.
- else:
    She is intensely focused, ignoring the late hour and the cold air, driven by an invisible engine.
}
player: (She doesn't need to work this hard. The estate will be hers regardless. Why is she doing this?)
* [Strict]
    player: Go to bed. The estate will not collapse if you take a night off.
* [Soft]
    player: Why are you pushing yourself so relentlessly? You have nothing to prove to me.
- scion: I don't know why. I just... I feel like I'm running out of time. Like there's a fire at my back and I have to be ready.
player: (The Conjunction. So Diogenes spoke truth. She feels the pull of the stars, even if she doesn't know what it means.)
player: (Oh {scion}, if only I could lift this burden from you...)
player: The only thing you need to be ready for is tomorrow's chores. Put the sword away.
-> END

=== father_2 ===
# title: The Shadows of the Past
# order: 20
# activity: socialize
# month: 3
# bg: home
# left: player
Breakfast is completely silent. She is staring blankly at her untouched bowl of porridge. # right: scion
{ melancholy > 40:
    scion: I had the nightmare again. The fire, the castle... the woman crying.
- else:
    scion: I had a strange dream last night. A castle burning. A man in black armor.
}
player: (Vortigan. And Queen Isolde. The memories of the coup are waking up.)
* [Dismissive]
    player: It is just the stress of your studies. Eat your breakfast.
    player: (If I validate it, she will pull at the thread. I must keep her anchored here.)
* [Comforting]
    player: Dreams can be frightening, but you are safe here with me.
    player: (I promised the Queen I would protect her. The truth will only paint a target on her back.)
- scion: It didn't feel like a dream, Father. It felt like a memory I'm not supposed to have.
player: You have a vivid imagination. Finish your food, your tutors are waiting.
-> END

=== father_3 ===
# title: The Question of Purpose
# order: 30
# activity: socialize
# month: 5
# bg: home
# left: player
She is packing her satchel for the day, pausing to look at her heavy, unusual curriculum. # right: scion
{ oratores > 30:
    scion: Diogenes is teaching me courtly Latin and the laws of royal succession.
- else:
    scion: Ser Bedivere is drilling me on heavy cavalry formations and siege tactics.
}
scion: Why? I'm the daughter of a borderland knight. I'm never going to command an army or parley with the Pope.
player: (The tutors know. Or they suspect. They're quietly preparing her for a war I don't want her to fight.)
* [Deflective]
    player: A well-rounded mind is a sharp weapon. Do not question your elders.
* [Pragmatic]
    player: The world is wider and more dangerous than this estate. You must be prepared for anything.
- scion: It feels like you're all preparing me for a life that isn't mine.
player: (It is exactly your life. I am just terrified for you to live it.)
-> END

=== father_4 ===
# title: The Revelation
# order: 40
# activity: socialize
# month: 7
# bg: home
# left: player
You enter your study. She is standing by your open lockbox, holding a heavy gold signet ring bearing the royal crest. # right: scion
{ laboratores > 40:
    You hid the key well, but she picked the lock with the skills Hancock taught her.
- else:
    You left the lockbox open in your haste this morning. A foolish, irreversible mistake.
}
scion: This is King Cornelius's seal. And this baby blanket... it has the royal crest. Who am I?
player: (The day I have dreaded for fourteen years is here.)
player: You are the true heir to the throne. You are the Queen's daughter.
scion: Everything... my whole life was a lie? Just to hide me?
* [Justify]
    player: It was the only way to keep you alive! Vortigan killed everyone else.
* [Apologize]
    player: I am so sorry. I promised your mother I would protect you, whatever the cost.
- scion: Protect me? You made me a ghost!
She drops the heavy gold ring onto the desk and flees the room.
-> END

=== father_5 ===
# title: The 'Man of Steel' Moment
# order: 50
# activity: socialize
# month: 9
# bg: home
# left: player
The rain outside is deafening. She sits by the hearth, her knees pulled to her chest, looking younger than she has in years. # right: scion
{ melancholy > 60:
    The weight of the kingdom is crushing her. She is shivering, though the fire is warm.
- else:
    The anger has faded, leaving only a quiet, terrifying uncertainty in her eyes.
}
scion: I don't want it. The crown, the prophecy, the blood. I don't want to lead an army.
scion: Can't I just... can't I just keep pretending I'm your daughter?
player: (My heart breaks for her. I wish to the saints I could say yes.)
* [Duty]
    player: The realm is bleeding. It needs its Queen. But I will always be your father.
* [Love]
    player: You are my daughter. A crown will never change that.
- scion: Are you sure? Even when they find out I'm a fraud? That I'm just a country girl?
player: I raised you. I watched you grow. Blood does not make a father, and blood does not make a Queen. Your choices do.
-> END

=== father_6 ===
# title: The 'Dune' Departure
# order: 60
# activity: socialize
# month: 11
# bg: home
# left: player
The eve of the Pilgrimage. Her pack is sealed. The heavy Pilgrim's cloak rests on her shoulders. # right: scion
// Draft condition: Bellatores + Oratores + Laboratores > 150; use Bellatores for her formidable presence, with the threshold divided by three.
{ bellatores > 50:
    She stands tall, a formidable presence. A true Sovereign, ready to forge her own destiny.
- else:
    She still looks so small wrapped in that heavy cloak, stepping into an impossibly large world.
}
scion: The Conjunction is tomorrow. I know what I have to do now.
player: (I cannot protect her by hiding her anymore. I can only protect her by trusting the woman I raised.)
* [Practical]
    player: Trust your training, and trust the allies you've made. They will follow you.
* [Emotional]
    player: Whatever kind of Queen you choose to be... I know it will be the right one.
- scion: I will come back for you. When the Usurper falls.
player: I know you will. May the saints guide you... my daughter.
-> END
