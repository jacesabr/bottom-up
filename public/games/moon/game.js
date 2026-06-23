// @ts-check
"use_strict"

const ZOOMX = 8;
const ZOOMY = 7;
const WORLDW = 90;
const WORLDH = 110;
const DEFAULT_WATER_SPEED = 4;
const MOON_FLOAT_UP_SPEED = 10;

const Ending =
{
    None: "error",
    Tragedy: "Tragedy",
    Goodbye: "Farewell",
    LostLove: "Lost Moon",
    HappyWithMoon: "Bring Me The Moon",
    IAmYourMoon: "I Am Your Moon",
    //Secret: "BURNED!",
    AllEmpty: "All Empty (hard)",
    count: 6, // remember to update
};

const Eyes =
{
    None: 0,
    IdleAt: 1,
    ClosedHappy: 2,
    ClosedUnhappy: 3,
    LookingDown: 4,
    LookingDownWorried: 5,
    SadSelf: 6,
    SadAt: 7,
    AngryAt: 8,
};

// loaded stuff
/** @type {HTMLCanvasElement} */
let canvas;
let showPlayScreen = true;
let playScreenShown = false;
let backBuffer;
let playerInteracted = false;
let stripBackground;
let stripWater;
let stripNewShootingStar;
let stripWaterSplash;
let stripBoat;
let stripMountains;
let stripStarShining;
let stripGullFlying;
let stripBoyHappy;
let stripGuysCrying = [];
let stripPosesSitting = [];
let stripPosesFalling = [];
let stripPosesRowing = [];
let stripBoyWithMoon;
let stripTicks;
let stripGirlHarping;
let stripBigMoon;
let stripSmallMoon;
let stripEyes;
let stripFont;
let stripGullFarGirl;
let stripGullFarBoy;
let stripGullExploding;
let stripGullFarEmpty;
let stripShootingStar;
let stripShootingStarGrabbed;
let stripVaporized;
let allSounds = [];
let sndFire;
let sndSplash;
let sndHarp;
let sndReset;
let sndGullExplodes;
let sndThud;
let sndWaterRunning;
let sndClickButton;
let sndPicks;
let sndBell;
let fontGray;
let fontWhite;

// loading
let pendingStuffToLoad = 0;
let initializedPostLoad = false;

// app
let mouseScreenX = 0;
let mouseScreenY = 0;
let mousePressed = false;
let mouseJustPressed = false;
let pressedR = false;
let pressedD = false;
let isPressedE = false;
let lastUpdateTime = Date.now();
let timeElapsed = 0;
let debugOn = false;
let debugLines = [];
let resetRect;
let bottomRect;
let endingsRect;

/** @type {GameState} */
let state;
let savegame;

class Strip
{
    constructor()
    {
        this.img = null;
        this.frames = [];
    }
}

class StripFrame
{
    constructor()
    {
        this.img = null;
        this.shadow = null;
        this.rect = new Rect();
        this.pivotx = 0;
        this.pivoty = 0;
        this.eyesPosition = [0, 0];
    }
}

class CollisionSurface
{
    constructor()
    {
        this.centerx = 0;
        this.centery = 0;
        this.radius = 0;
    }
}

class Actor
{
    constructor()
    {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.strip = null;
        this.stripFrame = 0;
        this.floats = false;
        this.animation = new FrameAnimation();
        this.collisionTopRadius = 0;
        this.collisionTopOffsetY = 0;
        this.restingOver = null;
        this.restingOverOffset = [0, 0];
        this.stripScrollingOffset = 0;
        this.alive = true;
        this.gotMoon = false;
        this.eyes = Eyes.None;
        this.pickable = true;
        this.lookingAt = [0, 0];
        this.gullIsClose = true;
        this.gullIsAngry = false;
        this.isTempAnim = false;
        this.isFireball = false;
        this.moonDrowning = false;
        this.flipX = false;
        this.shootingStarActivated = false;
        this.crying = false;
        this.isSmallMoon = false;
        this.sitting = false;
        this.velocityY = 0; 
        this.boatWentAway = false;
    }

    collisionTop()
    {
        let ret = new CollisionSurface();
        ret.centerx = this.x;
        ret.centery = this.collider().y + this.collisionTopOffsetY;
        ret.radius = this.collisionTopRadius;
        return ret;
    }

    colliderFor(x, y)
    {
        let frame = this.strip.frames[this.stripFrame];
        let ret = new Rect();
        ret.x = x - frame.pivotx;
        ret.y = y - frame.pivoty;
        ret.w = frame.rect.w;
        ret.h = frame.rect.h;

        // TODO: hack
        if(this.strip == stripPosesRowing[0] || this.strip == stripPosesRowing[1])
        {
            ret.h -= 4;
        }

        return ret;
    }

    collider()
    {
        return this.colliderFor(this.x, this.y);
    }
}

class PickedActor
{
    constructor()
    {
        this.actor = null;
        this.offset = [0, 0];
    }
}

class Savegame
{
    constructor()
    {
        this.endings = [];
    }
}

class GameState
{
    constructor()
    {
        this.boy = null;
        this.girl = null;
        this.moon = null;
        this.water = null;
        this.boat = null;
        this.gull = null;
        this.shootingStar = null;
        this.mountains = null;

        this.actors = [];
        this.pickedActors = [];
        this.moonStableOrbitY = 0;
        this.playingHarp = false;
        this.gullCarrying = null;
        this.timeUntilNextStarShine = 0;
        this.stars = [];
        this.idealBoatX = 0;
        this.fadeinElapsed = 0;
        this.fadeinDuration = 0;
        this.currentEnding = Ending.None;
        this.timeUntilNextShootingStar = 0;
        this.burnedSomething = false;
        this.endingFadeinTimerElapsed = 0;
        this.flashingResetButtonElapsed = 0;
    }
}

function fitCanvas()
{
    let windowW = window.innerWidth;
    let windowH = window.innerHeight;
    if(windowW > windowH)
    {
        canvas.height = windowH;
        canvas.width = canvas.height * (backBuffer.width / backBuffer.height);
    }
    else
    {
        canvas.width = windowW;
        canvas.height = canvas.width * (backBuffer.height / backBuffer.width);
    }

    // if(Math.abs(canvas.width - backBuffer.width) < 10)
    // {
    //     canvas.width = backBuffer.width;
    //     canvas.height = backBuffer.height;
    // }

    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.bottom = "0";
    canvas.style.left = "0";
    canvas.style.right = "0";
    canvas.style.margin = "auto";
}

function onInit()
{
    document.body.style.margin = "0px 0px 0px 0px";

    backBuffer = document.createElement("canvas");
    backBuffer.width = WORLDW * ZOOMX;
    backBuffer.height = (WORLDH + 12) * ZOOMY;

    canvas = document.createElement("canvas");
    fitCanvas();
    document.body.appendChild(canvas);
    window.onresize = fitCanvas;

    document.addEventListener("touchstart", 
        function (evt)
        {
            evt.preventDefault();
            mousePressed = true;
            mouseJustPressed = true;
            var rect = canvas.getBoundingClientRect();
            for(var i = 0; i < evt.touches.length; i++)
            {
                let touch = evt.touches[i];
                mouseScreenX = touch.clientX - rect.x;
                mouseScreenY = touch.clientY - rect.y;
            }

            // activatePlayerInteraction();
        },
    { passive: false });


    document.addEventListener("touchmove",
        function (evt)
        {
            evt.preventDefault();
            var rect = canvas.getBoundingClientRect();
            for(var i = 0; i < evt.touches.length; i++)
            {
                let touch = evt.touches[i];
                mouseScreenX = touch.clientX - rect.x;
                mouseScreenY = touch.clientY - rect.y;
            }
        },
        { passive: false });

    document.addEventListener("touchend",
        function (evt)
        {
            evt.preventDefault();
            activatePlayerInteraction();
            // evt.preventDefault();
            mousePressed = false;
        },
        { passive: false });


    document.onmousemove = function (me) 
    {
        var rect = canvas.getBoundingClientRect();
        mouseScreenX = me.clientX - rect.x; 
        mouseScreenY = me.clientY - rect.y;
    };

    document.onclick = function(me) {activatePlayerInteraction();}

    document.onmousedown = function (me) 
    { 
        if((me.buttons & 1) != 0)
        {
            mousePressed = true;
            mouseJustPressed = true;
        }
        activatePlayerInteraction();
    };
    document.onmouseup = function (me) 
    {
        // TODO: why do I need to add 1?
        if(((me.buttons + 1) & 1) != 0)
        {
            mousePressed = false;
        }
    };

    document.onkeydown = function (keyEvent) 
    { 
        if(keyEvent.key == "r") pressedR = true;
        if(keyEvent.key == "d") pressedD = true;
        if(keyEvent.key == "e") isPressedE = true;
    };

    document.onkeyup = function (keyEvent) 
    {
        if(keyEvent.key == "e") isPressedE = false;
    };

    let marginW = 10;
    let marginH = 10;
    let spaceBelowWorld = Math.floor(backBuffer.height - WORLDH * ZOOMY);
    let buttonW = backBuffer.width * 0.5 - marginW * 1.5;
    let buttonH = spaceBelowWorld - marginH * 2;
    bottomRect = new Rect(0, backBuffer.height - spaceBelowWorld, backBuffer.width, spaceBelowWorld);
    endingsRect = new Rect(marginW, backBuffer.height - spaceBelowWorld + marginH, buttonW, buttonH);
    resetRect = new Rect(endingsRect.right() + marginW, endingsRect.y, buttonW, buttonH);

    // schedule stuff to load
    stripBackground = single("back.png", 0, 0);
    stripMountains = single("mountains.png", 0, 13);
    stripWater = single("water.png", 45, 4);
    stripBoat = single("boat.png", 16, 10);
    stripTicks = strip("moonticks.png", 9, 9, 4, 9);
    stripWaterSplash = strip("splash.png", 20, 20, 10, 20);
    stripGirlHarping = strip("girl_harping.png", 13, 19, 5, 19, 4, 6);
    stripBoyWithMoon = single("boy_mooned.png", 6, 18, 3, 5);
    stripPosesSitting[0] = single("boy_sitting.png", 7, 18, 6, 4);
    stripPosesSitting[1] = single("girl_sitting.png", 8, 19, 7, 6);
    stripGuysCrying[0] = strip("boy_crying.png", 13, 18, 7, 18, 6, 4);
    stripGuysCrying[1] = strip("girl_crying.png", 12, 16, 5, 16, 5, 10);
    stripPosesFalling[0] = strip("boy_falling.png", 13, 18, 7 ,18, 6, 3);
    stripPosesFalling[1] = strip("girl_falling.png", 13, 19, 8, 18, 7, 4);
    stripPosesRowing[0] = strip("boy_rowing.png", 13, 19, 8, 15, 7, 1);
    stripPosesRowing[1] = strip("girl_rowing.png", 13, 19, 8, 15, 7, 2);
    stripStarShining = strip("star.png", 9, 9, 4, 4);
    stripGullFlying = strip("gull.png", 15, 12, 8, 6); 
    stripBigMoon = single("moon.png", 21, 0);
    stripSmallMoon = single("moon_small.png", 6, 6);
    stripEyes = strip("eyes.png", 2, 4, 0, 0);
    stripFont = strip("tinyfont.png", 10, 10, 0, 10);
    stripGullFarGirl = strip("gull_girl.png", 7, 9, 3, 7);
    stripGullFarBoy = strip("gull_boy.png", 7, 9, 3, 7);
    stripGullExploding = strip("gull_exploding.png", 22, 22, 11, 11);
    stripGullFarEmpty = strip("gull_far.png", 7, 9, 3, 7);
    stripNewShootingStar = strip("shootingstar.png", 20, 20, 10, 10);
    stripShootingStar = strip("firefly.png", 22, 22, 11, 11);
    stripShootingStarGrabbed = strip("firefly_grabbed.png", 8, 8, 4, 4);
    stripBoyHappy = strip("boy_sitting_happy.png", 16, 20, 7, 20, 6, 7);
    stripVaporized = strip("vaporized.png", 22, 22, 11, 11);
    sndReset = snd("restart.wav");
    sndFire = snd("fireball.wav");
    sndSplash = snd("splash.wav");
    sndGullExplodes = snd("paf.wav");
    sndThud = snd("thud.wav");
    sndClickButton = snd("click1.wav");
    sndPicks = snd("click4.wav");
    sndBell = snd("bell.wav");
    sndWaterRunning = snd("372181__amholma__ocean-noise-surf.mp3");
    sndWaterRunning.loop = true;
    sndHarp = snd("harp.mp3");
    sndHarp.loop = true;

    window.requestAnimationFrame(onInternalUpdate);

    function snd(path)
    {
        pendingStuffToLoad += 1;
        let ret = new Audio("data/snd/"+path);
        ret.preload = "auto";
        ret.load();
        ret.onloadeddata = function()
        {
            allSounds.push(ret);
            pendingStuffToLoad -= 1;
        };
        return ret;
    }

    function strip(path, cellw, cellh, pivotx, pivoty, eyex = 0, eyey = 0)
    {
        pendingStuffToLoad += 1;
        let ret = new Strip();
        ret.img = new Image();
        ret.img.src = "data/"+path;
        ret.img.onload = function()
        {
            cellw = cellw == 0 ? ret.img.width : cellw;
            cellh = cellh == 0 ? ret.img.height : cellh;
            let framesW = Math.floor(ret.img.width / cellw);
            let framesH = Math.floor(ret.img.height / cellh);
            for(let i = 0; i < framesH; i++) 
            {
                for(let j = 0; j < framesW; j++) 
                {
                    let frame = new StripFrame();
                    frame.pivotx = pivotx;
                    frame.pivoty = pivoty;
                    frame.eyesPosition = [eyex, eyey];
                    frame.rect.set(j * cellw, i * cellh, cellw, cellh);
                    ret.frames.push(frame);

                    let img = document.createElement("canvas");
                    img.width = cellw;
                    img.height = cellh;
                    // console.log(frame.rect.toString());
                    // console.log(pivotx + "," + pivoty);
                    let ctx = img.getContext("2d");
                    ctx.drawImage(ret.img, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h, 0, 0, frame.rect.w, frame.rect.h);
                    frame.img = img;

                    let shadow = document.createElement("canvas");
                    shadow.width = cellw;
                    shadow.height = cellh;
                    ctx = shadow.getContext("2d");
                    ctx.drawImage(ret.img, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h, 0, 0, frame.rect.w, frame.rect.h);
                    tintImage(shadow, 0x000000);
                    frame.shadow = shadow;
                }
            }
            pendingStuffToLoad -= 1;
        };
        return ret;
    }

    function single(path, pivotx, pivoty, eyex = 0, eyey = 0)
    {
        return strip(path, 0, 0, pivotx, pivoty, eyex, eyey); 
    }
}

function onInternalUpdate(now)
{
    let dt = (Date.now() - lastUpdateTime) / 1000;
    dt = Math.min(dt, 1/60);
    lastUpdateTime = Date.now();
    timeElapsed += dt;
    if(pendingStuffToLoad > 0)
    {
        onLoad(dt);
    }
    else
    {
        if(!initializedPostLoad)
        {
            savegame = new Savegame();
            fontGray = new BitmapFont();
            fontGray.loadFromStrip(stripFont, "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_~abcdefghijklmnopqrstuvwxyz{|}~", true);
            fontGray.char_sep -= 1;
            fontGray.tint(0x666666);

            fontWhite = new BitmapFont();
            fontWhite.loadFromStrip(stripFont, "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_~abcdefghijklmnopqrstuvwxyz{|}~", true);
            fontWhite.char_sep -= 1;
            fontWhite.tint(0xffffff);

            resetGame();
            state.fadeinDuration = 0.5;
            initializedPostLoad = true;
        }
        onUpdate(dt);
    }

    let canvascontext = canvas.getContext("2d");
    canvascontext.imageSmoothingEnabled = true;
    canvascontext.drawImage(backBuffer, 0, 0, backBuffer.width, backBuffer.height, 0, 0, canvas.width, canvas.height);


    pressedR = false;
    pressedD = false;
    mouseJustPressed = false;
    window.requestAnimationFrame(onInternalUpdate);
}

function onLoad(dt)
{
    let ctx = backBuffer.getContext("2d");
    let r = new Rect(0, 0, backBuffer.width, backBuffer.height);
    showLoadingC64(ctx, r);
}

function onUpdate(dt)
{
    let backBufferCanvasScaleX = backBuffer.height / canvas.height;
    let backBufferCanvasScaleY = backBuffer.width / canvas.width;
    let mouseBackBufferX = mouseScreenX * backBufferCanvasScaleX;
    let mouseBackBufferY = mouseScreenY * backBufferCanvasScaleY;
    let mousex = mouseBackBufferX / ZOOMX;
    let mousey = mouseBackBufferY / ZOOMY;
    if(showPlayScreen && !playScreenShown)
    {
        let ctx = backBuffer.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#000000";

        // ctx.scale(ZOOMX, ZOOMY);
        // drawFrame(ctx, stripBackground, 0, 0, 0);
        // ctx.restore();

        ctx.fillRect(0, 0, backBuffer.width, backBuffer.height);
        ctx.strokeStyle = "#666666";
        ctx.beginPath();
        ctx.lineWidth = ZOOMX;
        ctx.rect(0, 0, backBuffer.width, backBuffer.height);
        ctx.stroke();
        var bw = backBuffer.width * 0.75;
        var r = new Rect((backBuffer.width - bw) * 0.5, backBuffer.height * 0.5 + 60, bw, backBuffer.height * 0.1);
        let offy = 55;
        ctx.save();
        ctx.scale(2, 2);
        fontWhite.drawLine(ctx, "I Wish I Were the Moon", backBuffer.width * 0.5 / 2 + 0.5, offy, FONT_CENTER);
        offy += fontWhite.lineh + 5;
        fontWhite.drawLine(ctx, "(remastered)", backBuffer.width * 0.5 / 2 + 0.5, offy, FONT_CENTER);
        offy += fontWhite.lineh + 5;
        ctx.restore();

        ctx.save();
        ctx.scale(2, 2);
        fontGray.drawLine(ctx, "by Daniel Benmergui", backBuffer.width * 0.5 / 2 + 0.5, offy, FONT_CENTER);
        offy += fontWhite.lineh + 5;
        ctx.restore();

        ctx.save();
        ctx.scale(5, 5);
        drawFrame(ctx, stripBigMoon, 0, backBuffer.width * 0.5 / 5, 47);
        ctx.restore();

        offy = 700;
        let offx = 180 + 0.5;
        ctx.save();
        ctx.scale(1, 1);
        fontGray.drawLine(ctx, "credits:", offx, offy);
        offy += fontWhite.lineh + 5;
        fontGray.drawLine(ctx, "Harp clip by Cheryl Ann Fulton", offx, offy);
        offy += fontWhite.lineh + 5;
        fontGray.drawLine(ctx, "Sea clip by Andrew Holman", offx, offy);
        offy += fontWhite.lineh + 5;
        fontGray.drawLine(ctx, "Bell clip by Martin Durr", offx, offy);
        offy += fontWhite.lineh + 5;
        fontGray.drawLine(ctx, "Italo Calvino for \"The Distance of the Moon\"", offx, offy);
        offy += fontWhite.lineh + 5;
        offy += 15;
        fontGray.drawLine(ctx, "version 1.1", offx, offy);
        offy += fontWhite.lineh + 5;
        ctx.restore();

        drawButton(ctx, r, "Click To Play", mouseBackBufferX, mouseBackBufferY);
        if(mouseJustPressed && new Rect(0, 0, backBuffer.width, backBuffer.height).contains(mouseBackBufferX, mouseBackBufferY))
        {
            // playSound(sndClickButton);
            playScreenShown = true;
        }
        return;
    }

    if(sndWaterRunning.duration > 0 && sndWaterRunning.paused)
    {
        playSound(sndWaterRunning, 0.4);
    }

    let showEndings = false;
    if(pressedR || (resetRect.contains(mouseBackBufferX, mouseBackBufferY) && mouseJustPressed))
    {
        playSound(sndReset);
        resetGame();
        state.fadeinDuration = 0.5;
    }
    else
    if(isPressedE || (mousePressed && endingsRect.contains(mouseBackBufferX, mouseBackBufferY)))
    {
        if(mouseJustPressed)
        {
            playSound(sndClickButton);
        }
        showEndings = true;
    }

    let waterSpeed = state.currentEnding == Ending.None ? DEFAULT_WATER_SPEED : 0;
    // override for now
    waterSpeed = DEFAULT_WATER_SPEED;

    // sort actors by z
    state.actors.sort((a, b) => a.z - b.z);

    // pick actors
    let pickedSomething = false;
    let allCandidates = [];
    for(let a of state.actors)
    {
        if(mouseJustPressed && a.pickable && isPointInsideActorRect(a, mousex, mousey))
        {
            allCandidates.push(a);
        }
    }

    // keep the last candidate, if any, so we grab by the closest z
    if(allCandidates.length > 0)
    {
        let a = allCandidates[allCandidates.length - 1];
        // disconnect this actor from anything it was resting on
        a.restingOver = null;

        // special cases
        if(a == state.shootingStar)
        {
            // so it is centered
            a.x = mousex;
            a.y = mousey;
            a.z = state.boy.z + 100;
            a.isFireball = true;
        }
        else
        if(a == state.moon && a.isSmallMoon)
        {
            a.x = mousex;
            a.y = mousey;
            state.boy.gotMoon = false;
        }

        let picked = [a];
        picked = picked.concat(getActorsOnTopRecursive(a));

        state.pickedActors = [];
        for(let pick of picked)
        {
            pickedSomething = mouseJustPressed;
            let entry = new PickedActor();
            entry.actor = pick
            entry.offset = [mousex - pick.x, mousey - pick.y];
            state.pickedActors.push(entry);
        }
    }

    // move grabbed actors
    // find out the allowed area for dragging all the actors
    let enclosing = new Rect(0, 0, WORLDW, WORLDH - 6);
    let rx = 0;
    let ry = 0;
    let rr = enclosing.right();
    let rb = enclosing.bottom();
    for(let pickEntry of state.pickedActors)
    {
        let a = pickEntry.actor;
        let x = mousex - pickEntry.offset[0];
        let y = mousey - pickEntry.offset[1];
        let rect = a.colliderFor(x, y);
        rx = Math.max(rx, mousex - rect.x);
        ry = Math.max(ry, mousey - rect.y);
        rr = Math.min(rr, enclosing.right() - (rect.right() - mousex));
        rb = Math.min(rb, enclosing.bottom() - (rect.bottom() - mousey));
    }

    // snap mouse to allowed area for dragging
    let dragx = Math.max(Math.min(mousex, rr), rx);
    let dragy = Math.max(Math.min(mousey, rb), ry);

    // move grabbed actors
    for(let pickEntry of state.pickedActors)
    {
        let a = pickEntry.actor;
        a.x = dragx - pickEntry.offset[0];
        a.y = dragy - pickEntry.offset[1];
    }

    if(pickedSomething)
    {
        playSound(sndPicks, 0.3);
    }

    if(!mousePressed)
    {
        state.pickedActors = [];
    }

    // gravity
    for(let a of state.actors)
    {
        if(!a.floats && a.restingOver == null)
        {
            a.y += 16 * dt;
        }
    }

    // resting on top of things
    for(let a of state.actors)
    {
        if(isPicked(a)) continue;
        for(let b of state.actors)
        {
            if(a == b) continue;
            if(isPicked(b)) continue;
            if(state.gullCarrying == a) continue;
            if(a.restingOver != null) continue;
            let top = b.collisionTop();
            let deltaX = Math.abs(top.centerx - a.x);
            let deltaY = Math.abs(top.centery - a.y);
            if(deltaX <= top.radius && deltaY <= 4 && a.y >= top.centery)
            {
                let rests = false;
                if(a == state.boy || a == state.girl)
                {
                    rests = b == state.boat;
                    rests = rests || (b == state.moon && !state.moon.isSmallMoon);
                    rests = rests || (b == state.gull && !b.gullIsAngry && b.gullIsClose);
                }
                else
                if(a == state.boat)
                {
                    rests = b == state.water || (b == state.gull && b.gullIsClose) || (b == state.moon && !b.isSmallMoon);
                }

                if(rests && a.restingOver != b)
                {
                    setActorRestOver(a, b);
                    playSound(sndThud);
                }
            }
        }

        if(a.restingOver != null)
        {
            a.x = a.restingOver.x + a.restingOverOffset[0];
            a.y = a.restingOver.y + a.restingOverOffset[1];
        }
    }

    // collisions
    for(let a of state.actors)
    {
        if(isPicked(a)) continue;
        if(!a.alive) continue;

        let candidates = [];
        for(let b of state.actors)
        {
            if(a == b) continue;
            if(!b.alive) continue;
            if(isPicked(b)) continue;
            if(distance(a.x, a.y, b.x, b.y) >= 13) continue;
            candidates.push(b);
        }

        // sort candidates by reverse z and then by distance to a
        candidates.sort((x, y) => x.z - y.z);
        candidates.sort((x, y) => distance(a.x, a.y, x.x, x.y) - distance(a.x, a.y, y.x, y.y));

        for(let b of candidates)
        {
            if(!a.alive) break;
            if(a == state.shootingStar && a.isFireball)
            {
                if(b == state.boy || b == state.girl || b == state.gull || b == state.boat || (b == state.moon && b.isSmallMoon))
                {
                    state.burnedSomething = true;
                    addAnimVaporized(a.x, a.y, a.z);
                    playSound(sndFire);
                    a.alive = false;
                    b.alive = false;
                }
            }
            else 
            if(a == state.boy && b == state.moon && b.isSmallMoon && a.sitting)
            {
                a.gotMoon = true;
            }
        }
    }

    // shooting star
    state.timeUntilNextShootingStar -= dt;
    if(state.timeUntilNextShootingStar < 0)
    {
        state.timeUntilNextShootingStar = rnd(10, 15);
        // pick a location
        let x = rnd(10, 40);
        let y = rnd(10, 50);
        state.shootingStar.x = x;
        state.shootingStar.y = y;
        state.shootingStar.shootingStarActivated = true;
        playAnimation(state.shootingStar, stripNewShootingStar, 16);
        
    }

    // star shine
    state.timeUntilNextStarShine -= dt;
    if(state.timeUntilNextStarShine < 0)
    {
        state.timeUntilNextStarShine = rnd(2, 7);
        // pick a random star
        let starIndex = Math.floor(rnd(0, state.stars.length));
        let star = state.stars[starIndex];
        addTempAnim(star.x, star.y, star.z, stripStarShining, 4);
    }

    // behavior update
    for(let a of state.actors)
    {
        if(a == state.girl)
        {
            if(!a.alive)
            {
                a.playingHarp = false;
            }
        }
        if(!a.alive) continue;
        let isFalling = !a.floats && a.restingOver == null && !isPicked(a);
        if(a == state.shootingStar)
        {
            if(isMainPicked(a))
            {
                loopAnimation(a, stripShootingStarGrabbed, 4);
            }
            else
            if(a.isFireball)
            {
                a.alive = false;
                addAnimVaporized(a.x, a.y, a.z);
            }
            else
            if(!a.shootingStarActivated)
            {
                a.x = -100;
                a.y = -100;
            }
            else
            {
                if(!a.animation.running())
                {
                    a.shootingStarActivated = false;
                }
            }
        }
        else
        if(a == state.boy)
        {
            let index = a == state.boy ? 0 : 1;
            a.rowing = false;
            a.flipX = false;
            a.crying = false;
            a.sitting = false;

            if(a.gotMoon)
            {
                if(isFalling || !a.alive || isPicked(a))
                {
                    a.gotMoon = false;
                }
            }

            if(isMainPicked(a))
            {
                a.gotMoon = false;
                loopAnimation(a, stripPosesFalling[index], 4);
                a.eyes = Eyes.LookingDown;
            }
            else
            if(isFalling)
            {
                a.gotMoon = false;
                loopAnimation(a, stripPosesFalling[index], 4);
                a.eyes = Eyes.LookingDown;
            }
            else
            if(a.gotMoon)
            {
                state.moon.x = a.x + 4;
                state.moon.y = a.y - 5;
                loopAnimation(a, stripBoyWithMoon, 4);
                a.eyes = Eyes.ClosedHappy;
            }
            else
            if(a.restingOver == state.moon || (a.restingOver == state.boat && state.boat.restingOver == state.moon))
            {
                a.sitting = true;
                if(state.moon.moonDrowning)
                {
                    loopAnimation(a, stripPosesSitting[index], 2);
                    a.eyes = Eyes.LookingDownWorried;
                }
                else
                {
                    loopAnimation(a, stripBoyHappy, 1);
                    a.eyes = Eyes.ClosedHappy;
                }
            }
            else
            if(a.restingOver == state.boat)
            {
                a.sitting = true;
                lookAt(a, state.moon);
                a.eyes = Eyes.IdleAt;
                if(!state.moon.alive || state.moon.isSmallMoon)
                {
                    // TODO: this should be a high-priority state
                    // my moon is gone...
                    a.crying = true;
                    loopAnimation(a, stripGuysCrying[index], 2);
                    a.eyes = Eyes.None;
                }
                else
                if(state.boat.restingOver == state.water)
                {
                    a.rowing = true;
                    loopAnimation(a, stripPosesRowing[index], 3);
                }
                else
                {
                    a.eyes = Eyes.IdleAt;
                    a.rowing = true;
                    loopAnimation(a, stripPosesRowing[index], 3);
                }
            }
            else
            {
                a.sitting = true;
                loopAnimation(a, stripPosesSitting[index], 4);
                a.eyes = Eyes.IdleAt;
                lookAt(a, state.moon);
            }
        }
        else
        if(a == state.girl)
        {
            let index = a == state.boy ? 0 : 1;
            a.playingHarp = false;
            a.rowing = false;
            a.flipX = false;
            a.crying = false;
            a.sitting = false;

            if(!a.alive)
            {
            }
            else
            if(isMainPicked(a))
            {
                // TODO: proper anim
                loopAnimation(a, stripPosesFalling[index], 4);
                a.eyes = Eyes.LookingDown;
            }
            else
            if(isFalling)
            {
                loopAnimation(a, stripPosesFalling[index], 4);
                a.eyes = Eyes.LookingDown;
            }
            else
            if(!state.boy.alive || (state.gullCarrying == state.boy && !state.gull.gullIsClose))
            {
                loopAnimation(a, stripGuysCrying[index], 3);
                a.eyes = Eyes.None;
            }
            else
            if(a.restingOver == state.moon || (a.restingOver == state.boat && state.boat.restingOver == state.moon))
            {
                a.sitting = true;
                if(state.moon.moonDrowning)
                {
                    loopAnimation(a, stripPosesSitting[index], 2);
                    a.eyes = Eyes.LookingDownWorried;
                }
                else
                if(state.boy.alive && state.boy.restingOver == state.boat && state.boat.restingOver == state.water)
                {
                    a.playingHarp = true;
                    a.flipX = true;
                    loopAnimation(a, stripGirlHarping, 2);
                    a.eyes = Eyes.ClosedUnhappy;
                }
                else
                {
                    loopAnimation(a, stripPosesSitting[index], 4);
                    a.eyes = Eyes.IdleAt;
                    lookAt(a, state.boy);
                }
            }
            else
            if(a.restingOver == state.boat)
            {
                lookAt(a, state.boy);
                a.sitting = true;
                if(state.boat.restingOver == state.water && state.boy.alive && (state.boy.restingOver == state.moon || isMainPicked(state.boy)))
                {
                    a.rowing = true;
                }
                else
                {
                    a.rowing = false;
                }

                if(a.rowing)
                {
                    loopAnimation(a, stripPosesRowing[index], 3);
                }
                else
                {
                    loopAnimation(a, stripPosesSitting[index], 4);
                }

                if(state.boy.gotMoon)
                {
                    a.eyes = Eyes.AngryAt;
                }
                else
                if(state.boy.crying)
                {
                    a.eyes = Eyes.SadAt;
                }
                else
                {
                    a.eyes = Eyes.IdleAt;
                }
            }
            else
            {
                loopAnimation(a, stripPosesSitting[index], 4);
                a.eyes = Eyes.IdleAt;
                lookAt(a, state.boy);
            }
        }
        else
        if(a == state.moon)
        {
            if(a.isSmallMoon)
            {
                loopAnimation(a, stripSmallMoon, 1);
                let delta = Math.abs(a.y - state.moonStableOrbitY);
                let sign = Math.sign(a.y - state.moonStableOrbitY);
                if(delta > 4)
                {
                    a.y += MOON_FLOAT_UP_SPEED * dt * -sign;
                }

                if(isPicked(a) || state.boy.gotMoon)
                {
                    a.z = state.boy.z + 100;
                }
                else
                {
                    a.z = state.mountains.z - 1;
                }
            }
            else
            if(a.moonDrowning)
            {
                a.pickable = false;
                a.y += 10 * dt;
                if(a.y > WORLDW + state.moon.collider().h * 0.5 + 2)
                {
                    a.alive = false;
                }
            }
            else
            {
                let onTop = getActorsOnTopRecursive(a);
                if(onTop.length == 0)
                {
                    // drift up
                    a.velocityY += MOON_FLOAT_UP_SPEED * 0.0002;
                    a.velocityY = Math.min(a.velocityY, 2.5);
                    a.y -= a.velocityY * MOON_FLOAT_UP_SPEED * dt;
                }
                else
                if(onTop.length == 1)
                {
                    let stableOrbitY = state.moonStableOrbitY + Math.sin((timeElapsed) * 1.2 + Math.PI) * 3;
                    let delta = Math.abs(a.y - stableOrbitY);
                    let sign = Math.sign(a.y - stableOrbitY);
                    if(delta > 0.01)
                    {
                        a.y += MOON_FLOAT_UP_SPEED * 0.5 * dt * -sign;
                    }
                }
                else
                {
                    a.y += onTop.length * 4 * dt;
                }
            }

            if(a.y < -42)
            {
                // activate the small moon
                state.moon.isSmallMoon = true;
                a.y = -15;
                loopAnimation(a, stripSmallMoon, 1);
            }
            else
            if(a.y > state.water.y - 30)
            {
                a.moonDrowning = true;
            }
        }
        else
        if(a == state.boat)
        {
            // boat drifts if not being rowed
            if(a.restingOver == state.water)
            {
                if(!state.boy.rowing && !state.girl.rowing)
                {
                    let delta = waterSpeed * dt * 0.8;
                    a.x -= delta;
                    a.restingOverOffset = [a.restingOverOffset[0] - delta, a.restingOverOffset[1]];
                }
                else
                {
                    let diff = a.x - state.idealBoatX;
                    if(Math.abs(diff) > 3)
                    {
                        let delta = diff * dt * 0.35;
                        a.x -= delta;
                        a.restingOverOffset = [a.restingOverOffset[0] - delta, a.restingOverOffset[1]];
                    }
                }

                if(a.x < -20)
                {
                    a.boatWentAway = true;
                    // TODO: this may kill the person on top of it, don't do it
                    // a.alive = false;
                }
            }
            else
            {
                // boat always floats
                if(a.collider().bottom() > state.water.y)
                {
                    setActorRestOver(a, state.water);
                }
            }
        }
        else
        if(a == state.mountains)
        {
            a.stripScrollingOffset += waterSpeed * dt * 0.2;
            let maxW = a.strip.frames[a.stripFrame].rect.w;
            while(a.stripScrollingOffset > maxW)
            {
                a.stripScrollingOffset -= maxW;
            }
        }
        else
        if(a == state.water)
        {
            a.stripScrollingOffset += waterSpeed * dt;
            let maxW = a.strip.frames[a.stripFrame].rect.w;
            while(a.stripScrollingOffset > maxW)
            {
                a.stripScrollingOffset -= maxW;
            }
        }
        else
        if(a == state.gull)
        {
            if(a.gullIsClose)
            {
                // if overloaded, explode
                var onTop = getActorsOnTopRecursive(a);
                if(onTop.length >= 2 || onTop.indexOf(state.boat) >= 0)
                {
                    a.alive = false;
                    a.gullIsAngry = true;
                    for(let over of onTop)
                    {
                        over.restingOver = null;
                    }
                    addTempAnim(a.x, a.y, a.z, stripGullExploding, 24);
                    playSound(sndGullExplodes);
                }
                a.x -= 7 * dt;
                loopAnimation(a, stripGullFlying, 3);
                if(a.x < -20)
                {
                    a.gullIsAngry = false;
                    a.x = WORLDW + 20;
                    if(onTop.length > 0)
                    {
                        a.gullIsClose = false;
                        a.y = WORLDH * 0.5;
                        a.z = state.mountains.z + 1;
                        state.gullCarrying = onTop[0];
                        // freeze whoever is on top so they don't fall when I move
                        onTop[0].restingOver = null;
                        onTop[0].floats = true;
                    }
                }
            }
            else
            {
                a.pickable = false;
                a.x -= 10 * dt;
                if(a.x < -20)
                {
                    a.x = WORLDW + 20;
                }

                if(state.gullCarrying == state.girl)
                {
                    loopAnimation(a, stripGullFarGirl, 2);
                }
                else
                if(state.gullCarrying == state.boy)
                {
                    loopAnimation(a, stripGullFarBoy, 2);
                }
            }
        }

        // drowning
        if(!a.floats)
        {
            let col = a.collider();
            if(col.y + 5 > state.water.collider().y)
            {
                a.alive = false;
                addTempAnim(a.x, state.water.collider().y, state.water.z + 1, stripWaterSplash, 16);
                playSound(sndSplash);
            }
        }

        // animations
        if(a.animation.running())
        {
            a.animation.update(dt);
            a.stripFrame = a.animation.frame;
        }
        else
        if(a.isTempAnim)
        {
            a.alive = false;
        }
    }

    // rest things again
    for(let a of state.actors)
    {
        if(isPicked(a)) continue;
        if(a.restingOver == null) continue;
        a.x = a.restingOver.x + a.restingOverOffset[0];
        a.y = a.restingOver.y + a.restingOverOffset[1];
    }

    // clear deleted actors
    for(let a of state.actors)
    {
        if(!a.alive)
        {
            a.x = -100;
            a.y = -100;
            if(isPicked(a))
            {
                state.pickedActors = state.pickedActors.filter(pick => pick.actor !== a);
            }
            for(let b of state.actors)
            {
                if(b.restingOver == a)
                {
                    b.restingOver = null;
                }
            }
        }
    }
    state.actors = state.actors.filter(a => a.alive);

    if(state.girl.playingHarp)
    {
        playSound(sndHarp, 0.25);
    }
    else
    {
        stopSound(sndHarp);
    }

    // evaluate endings
    let oldEnding = state.currentEnding;
    state.currentEnding = Ending.None;
    if(!state.boy.alive && !state.girl.alive && !state.gull.alive && !state.moon.alive && (!state.boat.alive || state.boat.boatWentAway))
    {
        state.currentEnding = Ending.AllEmpty;
    }
    // else
    // if(state.burnedSomething)
    // {
    //     state.currentEnding = Ending.Secret;
    // }
    else
    if(state.girl.playingHarp && state.girl.alive)
    {
        state.currentEnding = Ending.IAmYourMoon;
    }
    else
    if(!state.gull.gullIsClose && (state.gullCarrying == state.girl || state.gullCarrying == state.boy))
    {
        state.currentEnding = Ending.Goodbye;
    }
    else
    if(!state.boy.alive)
    {
        state.currentEnding = Ending.Tragedy;
    }
    else
    if(state.boy.gotMoon)
    {
        state.currentEnding = Ending.HappyWithMoon;
    }
    else
    if((!state.moon.alive || state.moon.isSmallMoon) && state.boy.alive && state.boy.crying)
    {
        state.currentEnding = Ending.LostLove;
    }

    if(state.currentEnding != Ending.None)
    {
        if(oldEnding != state.currentEnding)
        {
            // start ending animation
            state.endingFadeinTimerElapsed = 0;
            playSound(sndBell, 0.2);
        }

        // update ending animation
        state.endingFadeinTimerElapsed = Math.min(state.endingFadeinTimerElapsed + dt, 1);

        if(savegame.endings.indexOf(state.currentEnding) == -1)
        {
            savegame.endings.push(state.currentEnding);
        }
    }

    // rendering
    /** @type {CanvasRenderingContext2D} */
    let ctx = backBuffer.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(ZOOMX, ZOOMY);
    drawFrame(ctx, stripBackground, 0, 0, 0);
    
    // first draw all actors normally
    for(let a of state.actors)
    {
        if(isPicked(a)) continue;
        drawActor(ctx, a);
    }

    // now draw all picked actor shadows
    for(let pickEntry of state.pickedActors)
    {
        let a = pickEntry.actor;
        drawFrame(ctx, a.strip, a.stripFrame, a.x, a.y + 1, a.flipX, true);
    }

    // now draw all picked actors again
    for(let pickEntry of state.pickedActors)
    {
        let a = pickEntry.actor;
        drawActor(ctx, a);
    }

    ctx.restore();

    // ending text
    ctx.save();
    ctx.scale(4, 4);
    let offx = 5;
    let offy = 20;
    if(state.currentEnding != Ending.None)
    {
        if(state.fadeinElapsed == state.fadeinDuration)
        {
            state.fadeinDuration = 0;
        }

        let oldAlpha = ctx.globalAlpha;
        let oldComposite = ctx.globalCompositeOperation;
        ctx.fillStyle = "#000000";
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = clamp01(state.endingFadeinTimerElapsed);

        let currentEndingText = state.currentEnding;
        fontWhite.drawLine(ctx, "\""+currentEndingText+"\"", offx, offy);
        offy += fontWhite.lineh + 4;

        ctx.globalAlpha = oldAlpha;
        ctx.globalCompositeOperation = oldComposite;

        // let countText = `${savegame.endings.length} of ${Ending.count} endings`;
        // if(state.currentEnding == Ending.SecretBurn) countText = "secret ending";
        // font.drawLine(ctx, countText, offx, offy);
    }
    ctx.restore();

    if(state.fadeinDuration > 0)
    {
        state.fadeinElapsed = Math.min(state.fadeinElapsed + dt, state.fadeinDuration);
        let oldAlpha = ctx.globalAlpha;
        let oldComposite = ctx.globalCompositeOperation;
        ctx.fillStyle = "#000000";
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1 - clamp01(state.fadeinElapsed / state.fadeinDuration);
        ctx.fillRect(0, 0, backBuffer.width, backBuffer.height); // note: this *2 is to prevent a glitch I can't explain
        ctx.globalAlpha = oldAlpha;
        ctx.globalCompositeOperation = oldComposite;
        if(state.fadeinElapsed == state.fadeinDuration)
        {
            state.fadeinDuration = 0;
        }
    }

    // endings page
    if(showEndings)
    {
        ctx.save();
        ctx.scale(ZOOMX, ZOOMY);
        drawFrame(ctx, stripBackground, 0, 0, 0);
        drawActor(ctx, state.mountains);
        drawActor(ctx, state.water);
        ctx.restore();

        ctx.save();
        let offx = 55;
        let offy = 20;
        ctx.scale(3, 3);
        fontGray.drawLine(ctx, "- Endings -", 120, offy, FONT_CENTER);
        offy += fontGray.lineh * 4;
        let allGoalsSolved = savegame.endings.length >= Ending.count;
        for(let endingKey in Ending)
        {
            let ending = Ending[endingKey];
            if(ending == Ending.None) continue;
            if(typeof ending != "string") continue;
            let isSolved = savegame.endings.indexOf(ending) >= 0;
            let tickFrame = isSolved ? 1 : 0;
            if(ending == Ending.Secret)
            {
                if(!isSolved)
                {
                    if(allGoalsSolved) ending = "???";
                    else continue;
                }
                tickFrame = isSolved ? 2 : 0;
            }
            drawFrame(ctx, stripTicks, tickFrame, offx - 9, offy - 1);
            fontGray.drawLine(ctx, ending, offx, offy, 0);
            offy += fontGray.lineh + 8;
        }
        ctx.restore();
    }

    { // buttons
        ctx.fillStyle = "#000000";
        ctx.fillRect(bottomRect.x, bottomRect.y, bottomRect.w, bottomRect.h);
        let movingResetRect = new Rect();
        movingResetRect.copyFrom(resetRect);
        state.flashingResetButtonElapsed += dt;
        if(state.currentEnding != Ending.None && savegame.endings.length <= 1) movingResetRect.y += Math.sin(state.flashingResetButtonElapsed * 7) * 4;
        debugLines.push("resetX: "+movingResetRect.y);
        drawButton(ctx, movingResetRect, "reset", mouseBackBufferX, mouseBackBufferY);
        let countText = `${savegame.endings.length} of ${Ending.count}`;
        drawButton(ctx, endingsRect, countText, mouseBackBufferX, mouseBackBufferY);
    }

    if(pressedD) debugOn = !debugOn;
    if(debugOn)
    {
        debugLines.push("mx:" + mousex.toFixed(4) + "my:" + mousey.toFixed(4));
        debugLines.push("boat alive:" + state.boat.alive);
        ctx.save();
        ctx.fillStyle = "white";
        ctx.font = '32px serif';
        let offy = 100;
        for(let line of debugLines)
        {
            ctx.fillText(line, 5, offy);
            offy += 30;
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "red";
        ctx.scale(ZOOMX, ZOOMY);
        // drawRect(ctx, new Rect(rx, ry, rr - rx, rb - ry));
        ctx.strokeStyle = "green";
        // drawRect(ctx, resetRect);
        ctx.strokeStyle = "red";
        for(let a of state.actors)
        {
            drawRect(ctx, a.colliderFor(a.x, a.y));
            drawRect(ctx, new Rect(a.x, a.y, 1, 1));
        }
        ctx.restore();
        debugLines = [];
    }
}

function setActorRestOver(a, b)
{
    let top = b.collisionTop();
    a.y = top.centery;
    a.restingOver = b;
    a.restingOverOffset = [a.x - b.x, a.y - b.y];
}

function resetGame()
{
    timeElapsed = 0;
    let zcounter = 10;
    state = new GameState();
    state.timeUntilNextStarShine = rnd(1, 10);
    state.timeUntilNextShootingStar = rnd(1, 3);
    state.idealBoatX = 28;
    addStar(11, 60);
    addStar(37, 25);
    addStar(50, 5);
    addStar(13, 12);
    addStar(74, 25);
    addStar(30, 47);
    addStar(79, 49);
    addStar(36, 87);
    addStar(69, 86);

    // addStarBig(9, 87);
    // addStarBig(18, 34);
    // addStarBig(50, 76);
    // addStarBig(58, 27);
    // addStarBig(78, 13);

    addStarBig(9, 82);
    addStarBig(45, 78);
    addStarBig(24, 38);
    addStarBig(59, 31);
    addStarBig(54, 13);
    addStarBig(80, 16);

    state.shootingStar = add(30, 30, stripShootingStar);
    state.shootingStar.floats = true;
    state.mountains = add(0, WORLDH, stripMountains);
    state.mountains.floats = true;
    state.mountains.pickable = false;
    state.moon = add(58, 40, stripBigMoon);
    state.moon.floats = true;
    state.moon.collisionTopRadius = 8;
    // state.moon.pickable = false;
    state.boat = add(state.idealBoatX, WORLDH - stripWater.frames[0].rect.h, stripBoat);
    state.boat.collisionTopRadius = 15;
    state.boat.collisionTopOffsetY = 7;
    state.boy = add(state.moon.x, state.moon.collider().y, stripPosesSitting[0]);
    
    state.girl = add(state.idealBoatX - 7, state.boat.collider().y + state.boat.collisionTopOffsetY, stripPosesSitting[1]);
    state.water = add(WORLDW * 0.5, WORLDH, stripWater);
    state.water.floats = true;
    state.water.collisionTopRadius = stripWater.frames[0].rect.w * 0.5;
    state.water.pickable = false;
    state.gull = add(WORLDW + 20, 50, stripGullFlying);
    state.gull.floats = true;
    state.gull.collisionTopRadius = 4;
    state.gull.collisionTopOffsetY = 6;
    state.moonStableOrbitY = state.moon.y;
    setActorRestOver(state.boat, state.water);
    setActorRestOver(state.girl, state.boat);
    setActorRestOver(state.boy, state.moon);

    function addStar(x, y)
    {
        let ret = add(x, y, stripStarShining);
        ret.floats = true;
        ret.pickable = false;
        state.stars.push(ret);
        return ret;
    }

    function addStarBig(x, y)
    {
        let ret = add(x, y, stripStarShining);
        ret.stripFrame = 1;
        ret.floats = true;
        ret.pickable = false;
        return ret;
    }


    function add(x, y, strip)
    {
        let ret = new Actor();
        ret.x = x;
        ret.y = y;
        ret.z = zcounter;
        ret.strip = strip;
        state.actors.push(ret);
        zcounter += 10;
        return ret;
    }
}

class Rect
{
    constructor(x = 0, y = 0, w = 0, h = 0)
    {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    contains(x, y)
    {
        return x >= this.x && x < this.right() && y >= this.y && y < this.bottom();
    }

    setR(r)
    {
        this.w = r - this.x;
    }

    setB(b)
    {
        this.h = b - this.y;
    }

    set(x, y, w, h)
    {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    copyFrom(other)
    {
        this.x = other.x;
        this.y = other.y;
        this.w = other.w;
        this.h = other.h;
    }

    enclose(other)
    {
        this.x = Math.min(this.x, other.x);
        this.y = Math.min(this.y, other.y);
        this.w = Math.max(this.right(), other.right()) - this.x;
        this.h = Math.max(this.bottom(), other.bottom()) - this.y;
    }

    right()
    {
        return this.x + this.w;
    }

    bottom()
    {
        return this.y + this.h;
    }

    centerx()
    {
        return this.x + this.w * 0.5;
    }

    centery()
    {
        return this.y + this.h * 0.5;
    }

    intersects(other)
    {
        if(this.w == 0 || this.h == 0 || other.w == 0 || other.h == 0) return false;
        if(other.x < this.x + this.w && this.x < other.x + other.w && other.y < this.y + this.h)
            return this.y < other.y + other.h;
        else
            return false;
    }

    toString()
    {
        return `(${this.x}, ${this.y}, ${this.w}, ${this.h})`;
    }
}

function getActorsOnTopRecursive(me)
{
    let ret = [];
    for(let other of state.actors)
    {
        if(other.restingOver == me)
        {
            ret.push(other);
            ret = ret.concat(getActorsOnTopRecursive(other));
        }
    }
    return ret;
}

function getActorsOnTop(me)
{
    let ret = [];
    for(let other of state.actors)
    {
        if(other.restingOver == me)
        {
            ret.push(other);
        }
    }
    return ret;
}

function isMainPicked(a)
{
    return state.pickedActors.length > 0 && state.pickedActors[0].actor === a;
}

function isPicked(a)
{
    return state.pickedActors.find(b => b.actor === a) != undefined;
}

/** @param {Actor} a*/
function isPointInsideActorRect(a, x, y)
{
    let collider = a.collider();
    return collider.contains(x, y);
    // let frame = a.strip.frames[a.stripFrame];
    // let w = frame.rect.w;
    // let h = frame.rect.h;
    // let left = a.x - frame.pivotx;
    // let right = left + w;
    // let top = a.y - frame.pivoty;
    // let bottom = top + h;
    // return x >= left && x < right && y >= top && y < bottom;
}

function addAnimVaporized(x, y, z)
{
    addTempAnim(x, y, state.boy.z + 100, stripVaporized, 16);
}

function addTempAnim(x, y, z, strip, fps)
{
    let tempAnim = new Actor();
    tempAnim.x = x;
    tempAnim.y = y;
    tempAnim.z = z;
    tempAnim.floats = true;
    tempAnim.isTempAnim = true;
    tempAnim.pickable = false;
    state.actors.push(tempAnim);
    playAnimation(tempAnim, strip, fps);
}

function playAnimation(a, strip, fps)
{
    // if already running, skip
    a.animation.fps = fps;
    a.strip = strip;
    a.stripFrame = 0;
    a.animation.once(strip.frames.length, fps);
}

function loopAnimation(a, strip, fps)
{
    // if already running, skip
    a.animation.fps = fps;
    if(a.strip == strip && a.animation.running()) return;
    a.strip = strip;
    a.stripFrame = 0;
    a.animation.loop(strip.frames.length, fps);
}

function lookAt(a, b)
{
    let c = b.collider();
    let fr = b.strip.frames[b.stripFrame];
    a.lookingAt = [b.x, c.y + fr.eyesPosition[1]];
}

function getActorPivot(a)
{
    let frame = a.strip.frames[a.stripFrame];
    return [frame.pivotx, frame.pivoty];
}

function drawEyes(ctx, a, eyes, x, y, lookx, looky)
{
    let sliceAngle = (Math.PI * 2) / 6; // only 6 eyes
    let o = Math.atan2(looky - y, lookx - x);
    o += sliceAngle * 1.5;
    if(o < 0) o += Math.PI * 2;
    let segmentIndex = Math.trunc(o / sliceAngle);
    let pupilIndex = segmentIndex;

    if(eyes == Eyes.IdleAt)
    {
        let pupil = pupilIndex;
        drawLeft(7, pupil);
        drawRight(7, pupil);
    }
    else
    if(eyes == Eyes.ClosedHappy)
    {
        drawLeft(12, 6);
        drawRight(12, 6);
    }
    else
    if(eyes == Eyes.ClosedUnhappy)
    {
        drawLeft(0, 13);
        drawRight(0, 13);
    }
    else
    if(eyes == Eyes.LookingDown)
    {
        drawLeft(7, 2);
        drawRight(7, 3);
    }
    else
    if(eyes == Eyes.LookingDownWorried)
    {
        drawLeft(8, 2);
        drawRight(9, 3);
    }
    else
    if(eyes == Eyes.SadSelf)
    {
        drawLeft(8, 2);
        drawRight(9, 3);
    }
    else
    if(eyes == Eyes.SadAt)
    {
        drawLeft(8, pupilIndex);
        drawRight(9, pupilIndex);
    }
    else
    if(eyes == Eyes.AngryAt)
    {
        drawLeft(9, pupilIndex);
        drawRight(8, pupilIndex);
    }

    function drawLeft(white, pupil)
    {
        drawFrame(ctx, stripEyes, white, x, y);
        drawFrame(ctx, stripEyes, pupil, x, y);
    }

    function drawRight(white, pupil)
    {
        drawFrame(ctx, stripEyes, white, x + 3, y);
        drawFrame(ctx, stripEyes, pupil, x + 3, y);
    }
}

function drawActor(ctx, a)
{
    let offx = 0;
    let offy = 0;
    if(a == state.mountains || a == state.water)
    {
        offx -= a.stripScrollingOffset;
        var frame = drawFrame(ctx, a.strip, a.stripFrame, a.x + offx, a.y + offy);
        drawFrame(ctx, a.strip, a.stripFrame, a.x + offx + frame.rect.w, a.y + offy);
    }
    else
    if(a == state.boy || a == state.girl)
    {
        let frame = a.strip.frames[a.stripFrame];
        let flipX = a.flipX;
        drawFrame(ctx, a.strip, a.stripFrame, a.x + offx, a.y + offy, flipX);
        let eyex = a.x - frame.pivotx + frame.eyesPosition[0] + offx;
        let eyey = a.y - frame.pivoty + frame.eyesPosition[1] + offy;
        if(flipX)
        {
            eyex = a.x - (frame.rect.w - frame.pivotx) + frame.rect.w - 5 - frame.eyesPosition[0] + 1;// frame.rect.w;
        }
        drawEyes(ctx, a, a.eyes, eyex, eyey, a.lookingAt[0], a.lookingAt[1]);
    }
    else
    {
        drawFrame(ctx, a.strip, a.stripFrame, a.x + offx, a.y + offy, a.flipX);
    }
}

/** @param {CanvasRenderingContext2D} ctx*/
function drawFrame(ctx, strip, frameIndex, x, y, flipX = false, isShadow = false)
{
    let frame = strip.frames[frameIndex];
    let r = frame.rect;
    let img = isShadow ? frame.shadow : frame.img;
    ctx.save();
    if(flipX)
    {
        ctx.translate(x + frame.pivotx, y - frame.pivoty);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -1, 0);
    }
    else
    {
        ctx.translate(x - frame.pivotx, y - frame.pivoty);
        ctx.drawImage(img, 0, 0);
    }
    ctx.restore();
    return frame;
}

/** @param {CanvasRenderingContext2D} ctx*/
function drawRect(ctx, r)
{
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx*/
function drawRectAt(ctx, x, y, w, h)
{
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.rect(x, y, w, h);
    ctx.stroke();
}

function drawButton(ctx, r, label, mouseBackBufferX, mouseBackBufferY)
{
    ctx.save();
    ctx.fillStyle = "#ff00ff";
    let offy = 0;
    if(r.contains(mouseBackBufferX, mouseBackBufferY))
    {
        if(mousePressed) offy = 1;
        else offy = -1;
    } 
    ctx.strokeStyle = "#666666";
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.rect(r.x + 0.5, r.y + 0.5, r.w, r.h); // NOTE: 0.5 added to prevent aliasing (html canvas starts at half pixel for some reason)
    ctx.stroke();
    let scalingx = ZOOMX - 4;
    let scalingy = scalingx;
    ctx.scale(scalingx, scalingy);
    fontGray.drawLine(ctx, label, r.centerx() / scalingx, r.centery() / scalingy + offy, FONT_VCENTER | FONT_CENTER);
    ctx.restore();
}

class FrameAnimation
{
    constructor()
    {
        this.elapsed = 0;
        this.looping = false;
        this.frame = 0;
        this.frameCount = 0;
        this.started = false;
        this.finished = false;
        this.fps = 1;
    }

    running()
    {
        return this.started && !this.finished;
    }

    once(frameCount, fps)
    {
        this.elapsed = 0;
        this.looping = false;
        this.frame = 0;
        this.frameCount = frameCount;
        this.started = true;
        this.finished = false;
        this.fps = fps;
    }

    loop(frameCount, fps)
    {
        this.elapsed = 0;
        this.looping = true;
        this.frame = 0;
        this.frameCount = frameCount;
        this.started = true;
        this.finished = false;
        this.fps = fps;
    }

    update(dt)
    {
        if(!this.started) return;
        this.elapsed += dt;
        let frameDuration = 1 / this.fps;
        if(this.elapsed >= frameDuration)
        {
            this.elapsed -= frameDuration;
            if(this.frame + 1 == this.frameCount)
            {
                if(this.looping)
                {
                    this.frame = 0;
                }
                else
                {
                    this.finished = true;
                }
            }
            else
            {
                this.frame += 1;
            }
        }
    }
}

function distance(x1, y1, x2, y2)
{
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}

const FONT_TOP = 4;
const FONT_CENTER = 1;
const FONT_VCENTER = 2;
const FONT_RIGHT = 8;
const FONT_BOTTOM = 16;

class Glyph
{
    constructor()
    {
        this.rect = new Rect();
        this.pivotx = 0;
        this.pivoty = 0;
        this.offsetx = 0;
        this.offsety = 0;
    }
}

class BitmapFont
{
    constructor()
    {
        /** @type {HTMLCanvasElement} */
        this.atlas = null;
        this.chars = null;
        this.glyphs = [];
        this.lineh = 0;
        this.max_char_height = 0;
        this.char_sep = 0;
        this.hasCapitalization = true;
    }

    tint(color) // an integer
    {
        tintImage(this.atlas, color);
    }

    loadFromStrip(strip, textMap, hasCapitalization)
    {
        this.hasCapitalization = hasCapitalization;
        // TODO: do we need to do thi? can't we use the image as is?
        this.atlas = canvasFromImage(strip.img);
        this.chars = textMap;
        this.lineh = strip.frames[0].rect.h;
        this.max_char_height = this.lineh;
        for(let i = 0; i < textMap.length; i++) 
        {
            const c = textMap[i];
            let fr = strip.frames[i];
            let g = new Glyph();
            g.rect.copyFrom(fr.rect);
            g.pivotx = fr.pivotx;
            g.pivoty = fr.pivoty;
            this.glyphs.push(g);
        }
    }

    drawLine(ctx, text, x, y, centering = 0, clip = null)
    {
        let area = new Rect();
        area.w = 10000;
        area.h = 10000;
        area.x = x;
        area.y = y;

        let startx = area.x;
        let starty = area.y;
        let size = this.processLine(ctx, text, startx, starty, area.w, false, clip);
        if((centering & FONT_CENTER) != 0)
        {
            startx = x - size.w * 0.5;
        }
        else
            if((centering & FONT_RIGHT) != 0)
            {
                startx = x - size.w;
            }

        if((centering & FONT_VCENTER) != 0)
        {
            starty = y + this.max_char_height * 0.5;
        }
        if((centering & FONT_TOP) != 0)
        {
            starty = y + this.lineh;
        }
        return this.processLine(ctx, text, startx, starty, area.w, true, clip);
    }

    paragraphSize(text, width)
    {
        let ret = [0,0];
        let lines = this.wordwrap(text, width);
        for(let curline of lines)
        {
            let rect = this.processLine(null, curline, 0, 0, width, false, null);
            ret[0] = Math.max(ret[0], rect.w);
            ret[1] += rect.h;
        }
        return ret;
    }

    drawParagraph(ctx, text, area, clip = null)
    {
        let lines = this.wordwrap(text, area.w);
        let offy = area.y + this.lineh; // move the baseline into the area
        for(let curline of lines)
        {
            this.drawLine(ctx, curline, area.x, offy, 0, clip);
            offy += this.lineh;
        }
    }

    wordwrap(text, width)
    {
        let wordstart = 0;
        let linebegin = 0;
        let offx = 0;
        let lines = [];
        let i = 0;
        while(i < text.length)
        {
            let char = text.charAt(i);
            if(char == "\n")
            {
                // TODO: duplicated code
                let line = text.substring(linebegin, i).trim();
                if(line.length == 0) return ["STRING OVERFLOW"]; // fail
                lines.push(line);
                i += 1;
                linebegin = i;
                wordstart = i;
                offx = 0;
                continue;
            }

            let index = this.chars.indexOf(char);
            let g = this.glyphs[index];

            offx += g.rect.w + g.offsetx + this.char_sep;
            if(char == " ")
            {
                wordstart = i + 1;
                i++;
                continue;
            }

            if(offx > width)
            {
                offx = 0;
                let line = text.substring(linebegin, wordstart - 1).trim();
                if(line.length == 0) return ["STRING OVERFLOW"]; // fail
                lines.push(line);
                linebegin = wordstart;
                i = wordstart;
            }
            else
            {
                i++;
            }
        }

        if(linebegin < i)
        {
            lines.push(text.substring(linebegin, text.length));
        }
        return lines;
    }

    processLine(ctx, text, x, y, width, render, clip)
    {
        if(!this.hasCapitalization) text = text.toUpperCase();
        let offx = 0;
        let maxW = 0;
        let startx = x;
        let starty = y;
        for (let i = 0; i < text.length; i++) 
        {
            const char = text[i];
            let index = this.chars.indexOf(char);
            let g = this.glyphs[index];
            if(render)
            {
                ctx.drawImage(this.atlas, g.rect.x, g.rect.y, g.rect.w, g.rect.h, startx + offx + g.offsetx - g.pivotx, starty - g.offsety - g.pivoty, g.rect.w, g.rect.h);
            }
            if(offx + g.rect.w + g.offsetx + this.char_sep > width)
            {
                break; // truncate
            }
            offx += g.rect.w;
            if(i < text.length - 1)
            {
                offx += g.offsetx + this.char_sep;
            }
            maxW = Math.max(maxW, offx);
        }
        let ret = new Rect();
        ret.x = x;
        ret.y = y - this.lineh;
        ret.w = maxW;
        ret.h = this.lineh;
        return ret;
    }
}

function stopSound(snd)
{
    snd.pause();
    snd.currentTime = 0;
}

function playSound(snd, volume = 1)
{
    if(!playerInteracted) return;
    if(!snd.paused) return;
    snd.volume = volume;
    let promise = snd.play();
    if(promise !== undefined)
    {
        promise.then(_ =>
        {
            // Autoplay started!
        }).catch(error =>
        {
            console.log(error + " trying to play " + snd.src);
            // Autoplay was prevented.
            // Show a "Play" button so that user can start playback.
        });
    }
}

function canvasFromImage(image)
{
    let ret = document.createElement("canvas");
    ret.width = image.width;
    ret.height = image.height;
    let ctx = ret.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return ret;
}

function rnd(start, end)
{
    return Math.floor(Math.random() * (end - start) + start);
}

function r2d(r)
{
    return 180 * r / Math.PI;
}

function clamp01(v)
{
    return Math.max(0, Math.min(1, v));
}

function randomColor()
{
    return Math.floor(Math.random() * 16777215).toString(16);
}

function pickRandomArrayElement(theArray)
{
    let index = rnd(0, theArray.length);
    return theArray[index];
}

function activatePlayerInteraction()
{
    if(!playerInteracted)
    {
        console.log("activating player interaction");
        playerInteracted = true;
        for(let snd of allSounds)
        {
            snd.play();
            snd.pause();
            snd.currentTime = 0;
        }
    }
}

function tintImage(image, color)
{
    let r = color >> 16 & 0xff;
    let g = color >> 8 & 0xff;
    let b = color >> 0 & 0xff;
    let ctx = image.getContext("2d");
    let imgData = ctx.getImageData(0, 0, image.width, image.height);
    for(let i = 0; i < imgData.data.length; i += 4) 
    {
        const byte = imgData.data[i];
        imgData.data[i + 0] = r;
        imgData.data[i + 1] = g;
        imgData.data[i + 2] = b;
    }
    ctx.putImageData(imgData, 0, 0);
}

/** @param ctx {CanvasRenderingContext2D} */
function showLoadingC64(ctx, rect)
{
    // c64 colors
    let colorsWeb = ["#000000", "#FFFFFF", "#880000", "#AAFFEE", "#CC44CC", "#00CC55", "#0000AA", "#EEEE77", "#DD8855", "#664400", "#FF7777", "#333333", "#777777", "#AAFF66", "#0088FF", "BBBBBB"];
    let colors = ["#000000", "#3e31a2", "#574200", "#8c3e34", "#545454", "#8d47b3", "#905f25", "#7c70da", "#808080", "#68a941", "#bb776d", "#7abfc7", "#ababab", "#d0dc71", "#acea88", "ffffff"];
    let bandH = 10;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    let bandCount = Math.floor(rect.h / bandH) + 1;
    let offy = 0;
    for(let i = 0; i < bandCount; i++) 
    {
        ctx.fillStyle = pickRandomArrayElement(colors);
        ctx.fillRect(rect.x, rect.y + offy, rect.w, bandH);
        offy += bandH;
    }
    ctx.restore();
}