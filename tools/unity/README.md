# Rebuilding AR Animal Run for the web

`/games/animal-run-3d/` is the client's own Unity game — *AR Animal Run*,
the 2020 project — compiled to WebGL. It is his scenes, his animals, his
three modes and his scoring, unchanged. The page around it
(`game46.html` + `assets/unity-switch.js`) only gives it a different way
to be pressed.

The build output is committed because the site is deployed by pulling
this repository, and nothing on the server has Unity on it. It is about
22 MB, so **do not commit a rebuild unless the game has actually
changed** — each one adds its full size to the history for good.

## Why it needs no changes to his C#

The switch layer calls the same method his own jump button calls:

```js
unityInstance.SendMessage('Characters', 'Jump');
```

`Characters` is the GameObject carrying `Character_Controller` in all
three gameplay scenes, and his jump button's `onClick` is wired to
`Character_Controller.Jump` on it. One call, one impulse — exactly a
tap of his button. His code never learns the difference. That is
deliberate: a reimplementation drifts from the original every time
either side is touched, and this cannot.

**If that object or method is renamed, the jump stops silently.** Unity
logs `SendMessage: object Characters not found!` and carries on;
nothing throws and no error reaches the page. So if a rebuild ever
makes the animal stop jumping, check those two names first — they are
`JUMP_OBJECT` and `JUMP_METHOD` in `assets/unity-switch.js`.

### Why not just press Space

It was a Space keydown, and that was wrong. A Space reaches `Jump()` by
**two** routes at once:

1. `Character_Controller.Update()` — `if (Input.GetKeyDown(KeyCode.Space))`
2. the EventSystem — `InputManager.asset` binds the UI `Submit` axis to
   `altPositiveButton: space`, so the same keystroke fires `onClick` on
   whichever button is selected, and the jump button's `onClick` is
   `Jump`.

Two `AddForce` impulses from one press, so a movement jumped about
twice as high as the on-screen button did. The page intercepts the real
space bar now for the same reason.

### The 0.9s wait

`Jump()` has no grounded check. The only thing limiting it in the
original is that `JumpDisable()` switches the on-screen button off and
`Invoke("JumpEnable", 0.9f)` switches it back on. Calling the method
directly skips that button, so the page holds the same 0.9s — without
it a held movement stacks impulses and the animal never comes down.

This is a latent fault in the original project's keyboard path: hold
space in a desktop build and the animal flies. The phone build has no
keyboard, so nothing ever reached it.

## What was changed, and only this

The source project is kept read-only. A working copy lives outside this
repository, at `../unity-animalrun`, and three things were removed from
it:

1. **AR Foundation, ARCore and ARKit packages.** WebGL does not support
   them, and nothing needs them: none of the four build scenes contains
   a single AR component.
2. **`Assets/Scripts/AR.cs` and `Assets/XR/`.** `AR.cs` is not attached
   to any scene in the build.
3. **Two lines in `GameManager.cs`** that called `GetComponent<AR>()`
   inside `EnadlePlacingObject` / `DisadlePlacingObject`. Both methods
   are kept, because old UI buttons reference them by name; they just no
   longer reach into a component that is gone. Nothing calls either
   method from script.

Nothing else. No gameplay, no art, no balance, no scenes.

## Building

The project was authored in Unity **2020.2.7f1**, which is not installed
here; it was built with **6000.3.8f1**, the only installed editor with
the WebGL module. Unity upgraded the project on open and his scripts
compiled with zero errors.

```
"D:\Unity\6000.3.8f1\Editor\Unity.exe" -quit -batchmode -nographics ^
  -projectPath "..\..\..\unity-animalrun" -buildTarget WebGL ^
  -executeMethod WebBuild.Run -outDir "..\..\..\unity-animalrun\WebBuild" ^
  -logFile -
```

`WebBuild.cs` in this folder is the build script; it belongs in the Unity
project at `Assets/Editor/WebBuild.cs`. It sets gzip compression with
Unity's decompression fallback switched on, so the files can be served by
the same plain `express.static` as the rest of the site — no
`Content-Encoding` headers to get right on deploy.

Copy the result to `games/animal-run-3d/`. The paywall covers it already:
`server.js` gates anything under `/games/`.

## Known, and not yet settled

- **The Unity splash screen.** The build shows "Made with Unity" on
  start, which a Personal licence cannot remove. His mobile build has
  the same. Removing it needs a Unity Pro/Plus seat.
- **His menu is a pointer UI.** Choosing an animal and a mode, and
  pressing Start, is done by tapping. A child who cannot use a pointer
  needs an adult to set the round up; the switch then plays it. Driving
  that menu from the switch would mean changing his C#, which is a
  decision for him, not an assumption for us.
- **22 MB.** Cached after the first load (`dataCaching`), but the first
  load on a slow school connection is a real wait. This is why the
  lighter 2D version (games 43–45) stays in the catalogue beside it.
