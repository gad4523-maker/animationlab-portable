"""Beacon Wake. All scenery, cutout poses and effects are drawn in code."""
import math
import random

from PIL import Image, ImageDraw


def ease(start, end, x):
    k = max(0, min(1, (x - start) / (end - start)))
    return k * k * (3 - 2 * k)


def init_shot(w, h, fps, shot, root):
    sx, sy = w / 360, h / 640
    wide = shot["params"]["angle"] == "wide"
    count = int(86 * shot["_profile"]["particles"])
    rng = random.Random(5578)
    embers = [(rng.random() * 360, rng.random() * 570, rng.random()) for _ in range(count)]
    sky = Image.new("RGB", (w, h))
    pen = ImageDraw.Draw(sky)
    for y in range(h):
        t = y / h
        pen.line((0, y, w, y), fill=(int(10 + 48 * t), int(21 + 58 * t), int(39 + 48 * t)))

    def draw_frame(frame, sec):
        image = sky.copy()
        pen = ImageDraw.Draw(image)
        fx = 0 if wide else ease(0.80, 0.86, sec) * (1 - ease(0.88, 1.40, sec))
        settle = ease(0.0, 1.5, sec)
        shake = math.sin((sec - .83) * 83) * fx * 5

        def pt(x, y):
            return (round((x + shake) * sx), round(y * sy))

        def polygon(points, color):
            pen.polygon([pt(x, y) for x, y in points], fill=color)

        def ellipse(x, y, rx, ry, color, outline=None, line=1):
            pen.ellipse((*pt(x - rx, y - ry), *pt(x + rx, y + ry)), fill=color,
                        outline=outline, width=max(1, round(line * sx)))

        def stroke(points, color, width=1):
            pen.line([pt(*p) for p in points], fill=color, width=max(1, round(width * sx)), joint="curve")

        moon_x = 250 - settle * 9
        ellipse(moon_x, 132, 54, 56, "#25364b")
        ellipse(moon_x, 132, 40, 42, "#efd6a6")
        ellipse(moon_x + 16, 123, 39, 40, "#202f46")
        for i, (base, color) in enumerate([(334, "#294653"), (389, "#233947"), (445, "#1a303e")]):
            offset = settle * (9 + i * 14)
            peaks = [(-85 + j * 30 - offset, base + 25 * math.sin(j * 1.24 + i)
                      + 41 * math.cos(j * .44 - i)) for j in range(19)]
            polygon([*peaks, (450, 641), (-90, 641)], color)
        for j in range(13):
            x = j * 35 - settle * 60
            y = 433 + 22 * math.sin(j * 1.8)
            polygon([(x - 5, 550), (x + 3, y), (x + 9, y - 14), (x + 13, 550)], "#152633")
        polygon([(-15, 480), (89, 457), (264, 464), (377, 516), (377, 655), (-15, 655)], "#101e2b")
        stroke([(-10, 482), (89, 457), (264, 464), (373, 516)], "#61747a", 2)
        for j in range(8):
            stroke([(0, 505 + 18 * j), (360, 528 + 27 * j)], "#203542")
        for x in (-210, -90, 10, 100, 220, 330, 440, 570):
            stroke([(160 + (x - 160) * .12, 467), (x, 640)], "#203542")

        x = 221 + (1 - settle) * 32 if wide else 230
        y = 381 if wide else 346
        k = 0.82 if wide else 1.0
        ellipse(x, y + 103 * k, 55 * k, 13 * k, "#0c1722")
        for z, halfwidth in ((95, 44), (79, 32), (35, 24)):
            top = y + z * k
            polygon([(x-halfwidth*k, top), (x+halfwidth*k, top),
                     (x+(halfwidth+9)*k, top+13*k), (x-(halfwidth+9)*k, top+13*k)], "#354b54")
            stroke([(x-halfwidth*k, top), (x+halfwidth*k, top)], "#658284", 2)
        polygon([(x-17*k, y+35*k), (x+17*k, y+35*k), (x+21*k, y+79*k), (x-21*k, y+79*k)], "#263644")
        for j in (-1, 1):
            stroke([(x+j*17*k, y+29*k), (x+j*27*k, y-27*k), (x+j*14*k, y-45*k)], "#69838a", 5)
        cy = y - 11 - 7 * math.sin(sec * 3.4)
        cyan = "#f8f9cf" if fx > .25 else "#7de1c5"
        ellipse(x, cy, 20*k, 20*k, "#254e52")
        ellipse(x, cy, 11*k + fx * 10, 11*k + fx * 10, cyan)
        ellipse(x - 3, cy - 3, 4*k, 4*k, "#fefff3")

        # A wire-jointed courier with an arcing reach, trailing scarf and planted feet.
        brace = ease(1.48, 1.96, sec) if wide else 0
        reach = ease(.20, .68, sec) if not wide else .15 * settle + .33 * brace
        crouch = math.sin(math.pi * reach) * 8 + brace * 6
        actor_x = (94 + settle * 28) if wide else 125
        torso = 413 + crouch
        ankle = 472 if wide else 482
        step = math.sin(sec * math.tau * 1.05) * (1 - ease(.85, 1.4, sec)) if wide else 0
        ellipse(actor_x, ankle, 39, 8, "#091623")
        front_knee = actor_x + 14 + reach * 8
        stroke([(actor_x, torso + 17), (actor_x - 13, ankle - 23), (actor_x - 25 - step * 12, ankle - max(0, -step) * 11)], "#2c424f", 14)
        front_foot = actor_x + 16 + step * 13
        front_height = ankle - max(0, step) * 12
        stroke([(actor_x + 7, torso + 17), (front_knee, ankle - 23), (front_foot, front_height)], "#5c7a83", 13)
        stroke([(front_foot - 3, front_height), (front_foot + 11, front_height)], "#c7d1c2", 5)
        flutter = math.sin(sec * 9) * 10
        polygon([(actor_x + 2, torso - 30), (actor_x - 28, torso - 25),
                 (actor_x - 65, torso - 24 + flutter), (actor_x - 47, torso - 9 + flutter),
                 (actor_x - 11, torso - 14)], "#c45e44")
        polygon([(actor_x - 13, torso-25), (actor_x+19, torso-24), (actor_x+23, torso+11),
                 (actor_x+6, torso+23), (actor_x-17, torso+14)], "#a8c7b7")
        polygon([(actor_x+1, torso-22), (actor_x+20, torso-21), (actor_x+22, torso+10),
                 (actor_x+6, torso+21), (actor_x+2, torso+12)], "#567b75")
        ellipse(actor_x+10, torso-44, 18, 17, "#182e3c")
        polygon([(actor_x-8, torso-50), (actor_x, torso-61), (actor_x+20, torso-61),
                 (actor_x+30, torso-48), (actor_x+28, torso-40), (actor_x+5, torso-42)], "#91bab2")
        stroke([(actor_x+15, torso-44), (actor_x+27, torso-43)], cyan, 2)
        hand = (actor_x + 33 + 56*reach, torso - 10 - 44*reach)
        elbow = (actor_x + 28 + 15*reach, torso + 2 - 25*reach)
        stroke([(actor_x+13, torso-17), elbow, hand], "#142735", 12)
        stroke([(actor_x+13, torso-18), elbow, hand], "#74978c", 7)
        ellipse(*hand, 5, 5, "#e1c68c")

        for i, (px, py, size) in enumerate(embers):
            xx = (px + sec * (10 + 24 * size)) % 360
            yy = (py - sec * (6 + 21 * size)) % 570
            ellipse(xx, yy, .4 + size * .9, .5 + size * 1.2,
                    "#7d8b7e" if i % 5 else "#d3a265")

        if not wide:
            if .66 < sec < .81:
                stroke([(hand[0] - 26, hand[1] + 24), hand], "#67c4a7", 3)
            wave = ease(.82, 1.67, sec)
            if 0 < wave < 1:
                ellipse(x, cy, 16 + 280*wave, 14 + 180*wave, None,
                        "#e5f4be" if wave < .58 else "#568b82", max(1, 3*(1-wave)))
            if fx > .06:
                for i, (_, _, size) in enumerate(embers):
                    ang = i * math.tau / count
                    distance = (26 + wave * (198 + size*48))
                    ex, ey = x + math.cos(ang)*distance, cy + math.sin(ang)*distance
                    stroke([(ex, ey), (ex-math.cos(ang)*(3+size*8), ey-math.sin(ang)*(3+size*8))],
                           "#e0ebb9", 1 + 2*fx)
        return image

    return draw_frame
