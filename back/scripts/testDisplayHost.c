/* Host window for the headed test display.
 * The window manager does not draw this title bar. We do, so it can carry
 * Pause, Restart, Stop, and a throttle field. The top row is the drag handle.
 * The window stays in normal stacking, so other windows can cover it, and it
 * does not take the keyboard when it opens. Clicking the throttle field takes
 * the keyboard until Set or Escape.
 *
 * Stdout: the Xephyr parent id, then one command per line
 * (pause, restart, quit, throttle <ms>).
 * Stdin: "paused", "running", "throttle <ms>", "status <text>",
 * or "progress <index - current/total - failed>", then EOF to close.
 * Usage: test-display-host <x> <y> <width> <height> <title> <throttle-ms>
 */
#include <X11/Xatom.h>
#include <X11/keysym.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <time.h>
#include <unistd.h>

#define ROW_H 36
#define BAR_H (ROW_H * 2)
#define BAR_PAD 10
#define BUTTON_H 26
#define BUTTON_GAP 8
/* Motif hints: draw no frame, but allow the window to be moved. */
#define MWM_HINTS_FUNCTIONS (1L << 0)
#define MWM_HINTS_DECORATIONS (1L << 1)
#define MWM_FUNC_MOVE (1L << 2)

typedef struct {
  const char *label;
  const char *command;
  int x;
  int y;
  int w;
  int h;
  int accent;
} Button;

static Display *display;
static Window shell;
static Window content;
static GC backgroundGc;
static GC buttonGc;
static GC pressedGc;
static GC accentGc;
static GC pressedAccentGc;
static GC stopGc;
static GC pressedStopGc;
static GC textGc;
static GC fieldGc;
static XFontStruct *font;
static Button buttons[3];
static int buttonCount;
static int pressed = -1;
static int pressedSet = 0;
static int flashButton = -1;
static int flashSet = 0;
static struct timespec flashUntil;
static int paused = 0;
static int fieldFocused = 0;
static int replaceOnType = 0;
static char throttleText[8] = "0";
static int throttleLen = 1;
static int fieldX;
static int fieldY;
static int fieldW;
static int fieldH;
static int setX;
static int setY;
static int setW;
static int setH;
static int msX;
static int throttleLabelX;
static const char *title = "";
static int contentWidth;
static int contentHeight;
static int barHeight = BAR_H;
static int statusTop;
static int statusLineH;
static char statusText[640];
static int statusLen;
static char progressText[48];
static int progressLen;

static int statusLineLimit(void) {
  /* The handset window is narrow, so the current test wraps. The desktop window fits one line. */
  return contentWidth < 700 ? 4 : 1;
}

static void layoutBar(void) {
  statusLineH = font->ascent + font->descent + 3;
  if (statusLineH < 16) statusLineH = 16;
  statusTop = BAR_H + 6;
  barHeight = statusTop + statusLineLimit() * statusLineH + 6;
}

static void redraw(void);
static void setCardinal(Window window, const char *name, unsigned long value);

static unsigned long rgb(int screen, unsigned short r, unsigned short g, unsigned short b) {
  XColor color;
  color.red = (unsigned short)(r * 257);
  color.green = (unsigned short)(g * 257);
  color.blue = (unsigned short)(b * 257);
  color.flags = DoRed | DoGreen | DoBlue;
  XAllocColor(display, DefaultColormap(display, screen), &color);
  return color.pixel;
}

static void emit(const char *command) {
  printf("%s\n", command);
  fflush(stdout);
}

static void setThrottleText(const char *value) {
  int count = 0;
  while (value[count] >= '0' && value[count] <= '9' && count < 5) count++;
  if (count == 0) {
    throttleText[0] = '0';
    throttleText[1] = '\0';
    throttleLen = 1;
    return;
  }
  memcpy(throttleText, value, (size_t)count);
  throttleText[count] = '\0';
  throttleLen = count;
}

static void layoutButtons(void) {
  const char *labels[] = {"Pause", "Restart", "Stop"};
  const char *commands[] = {"pause", "restart", "quit"};
  int accent[] = {0, 0, 1};
  buttonCount = 3;
  int x = contentWidth - BAR_PAD;
  int y = (ROW_H - BUTTON_H) / 2;
  for (int i = buttonCount - 1; i >= 0; i--) {
    int text = XTextWidth(font, labels[i], (int)strlen(labels[i]));
    int width = text + 22;
    x -= width;
    buttons[i].label = labels[i];
    buttons[i].command = commands[i];
    buttons[i].x = x;
    buttons[i].y = y;
    buttons[i].w = width;
    buttons[i].h = BUTTON_H;
    buttons[i].accent = accent[i];
    x -= BUTTON_GAP;
  }
}

static void layoutThrottle(void) {
  int labelW = XTextWidth(font, "Throttle", 8);
  int msW = XTextWidth(font, "ms", 2);
  int gap = 8;
  setW = XTextWidth(font, "Set", 3) + 22;
  setH = BUTTON_H;
  fieldH = BUTTON_H;
  fieldW = 72;
  fieldY = ROW_H + (ROW_H - BUTTON_H) / 2;
  setY = fieldY;
  int total = labelW + gap + fieldW + gap + msW + gap + setW;
  int room = contentWidth - BAR_PAD * 2;
  if (total > room && fieldW - (total - room) >= 48) {
    fieldW -= total - room;
    total = labelW + gap + fieldW + gap + msW + gap + setW;
  }
  int x = contentWidth - BAR_PAD - total;
  if (x < BAR_PAD) x = BAR_PAD;
  throttleLabelX = x;
  fieldX = throttleLabelX + labelW + gap;
  msX = fieldX + fieldW + gap;
  setX = msX + msW + gap;
}

static void armFlash(int button, int set) {
  clock_gettime(CLOCK_MONOTONIC, &flashUntil);
  flashUntil.tv_nsec += 160L * 1000L * 1000L;
  if (flashUntil.tv_nsec >= 1000000000L) {
    flashUntil.tv_sec += 1;
    flashUntil.tv_nsec -= 1000000000L;
  }
  flashButton = button;
  flashSet = set;
}

static int buttonLit(int index) {
  return pressed == index || flashButton == index;
}

static int hitField(int x, int y) {
  return x >= fieldX && x < fieldX + fieldW && y >= fieldY && y < fieldY + fieldH;
}

static int hitSet(int x, int y) {
  return x >= setX && x < setX + setW && y >= setY && y < setY + setH;
}

static int hitButton(int x, int y) {
  for (int i = 0; i < buttonCount; i++) {
    Button *button = &buttons[i];
    if (x >= button->x && x < button->x + button->w && y >= button->y && y < button->y + button->h) return i;
  }
  return -1;
}

static void drawText(const char *text, int x, int y, int width) {
  int baseline = y + (BUTTON_H + font->ascent - font->descent) / 2;
  XRectangle clip;
  clip.x = (short)x;
  clip.y = (short)y;
  clip.width = (unsigned short)width;
  clip.height = BUTTON_H;
  XSetClipRectangles(display, textGc, 0, 0, &clip, 1, Unsorted);
  XDrawString(display, shell, textGc, x, baseline, text, (int)strlen(text));
  XSetClipMask(display, textGc, None);
}

static void setInputHint(int enabled) {
  XWMHints hints;
  memset(&hints, 0, sizeof hints);
  hints.flags = InputHint;
  hints.input = enabled ? True : False;
  XSetWMHints(display, shell, &hints);
}

static void focusField(int enabled, Time time) {
  fieldFocused = enabled;
  replaceOnType = enabled ? 1 : 0;
  if (enabled) {
    /* Opening the window leaves the keyboard alone. A click in the field may take it. */
    setInputHint(1);
    setCardinal(shell, "_NET_WM_USER_TIME", time);
    XFlush(display);
    XSetInputFocus(display, shell, RevertToParent, time);
  } else {
    XSetInputFocus(display, PointerRoot, RevertToPointerRoot, CurrentTime);
    setInputHint(0);
  }
}

static void emitThrottle(void) {
  if (throttleLen <= 0) return;
  char command[32];
  snprintf(command, sizeof command, "throttle %s", throttleText);
  emit(command);
  focusField(0, CurrentTime);
  redraw();
}

static void setProgressText(const char *value) {
  int count = 0;
  while (value[count] != '\0' && count < (int)sizeof progressText - 1) {
    unsigned char c = (unsigned char)value[count];
    if (!((c >= '0' && c <= '9') || c == '/' || c == ' ' || c == '-')) break;
    count++;
  }
  memcpy(progressText, value, (size_t)count);
  progressText[count] = '\0';
  progressLen = count;
}

static void setStatusText(const char *value) {
  int count = 0;
  for (int i = 0; value[i] != '\0' && count < (int)sizeof statusText - 1; i++) {
    unsigned char c = (unsigned char)value[i];
    if (c >= 0x20 && c <= 0x7e) statusText[count++] = (char)c;
  }
  while (count > 0 && statusText[count - 1] == ' ') count--;
  statusText[count] = '\0';
  statusLen = count;
}

static void drawStatus(void) {
  if (statusLen <= 0) return;
  int maxW = contentWidth - BAR_PAD * 2;
  if (maxW < 40) return;
  int lines = statusLineLimit();
  int start = 0;
  for (int line = 0; line < lines && start < statusLen; line++) {
    int end = start;
    int breakAt = -1;
    while (end < statusLen && XTextWidth(font, statusText + start, end - start + 1) <= maxW) {
      if (statusText[end] == ' ') breakAt = end;
      end++;
    }
    int more = end < statusLen;
    int drawEnd = !more ? statusLen : (breakAt > start ? breakAt : (end > start ? end : start + 1));
    char shown[640];
    int count = drawEnd - start;
    if (count > 600) count = 600;
    memcpy(shown, statusText + start, (size_t)count);
    if (line == lines - 1 && drawEnd < statusLen) {
      while (count > 0 && XTextWidth(font, shown, count) + XTextWidth(font, "...", 3) > maxW) count--;
      memcpy(shown + count, "...", 3);
      count += 3;
      more = 0;
    }
    if (count <= 0) break;
    int baseline = statusTop + line * statusLineH + font->ascent;
    XDrawString(display, shell, textGc, BAR_PAD, baseline, shown, count);
    if (!more) break;
    start = drawEnd;
    while (start < statusLen && statusText[start] == ' ') start++;
  }
}

static void redraw(void) {
  layoutThrottle();
  XFillRectangle(display, shell, backgroundGc, 0, 0, (unsigned)contentWidth, (unsigned)barHeight);
  int titleRoom = buttons[0].x - BAR_PAD - 12;
  if (titleRoom > 0) {
    char shown[160];
    if (paused) snprintf(shown, sizeof shown, "%s, paused", title);
    else snprintf(shown, sizeof shown, "%s", title);
    int baseline = (ROW_H + font->ascent - font->descent) / 2;
    XRectangle clip;
    clip.x = BAR_PAD;
    clip.y = 0;
    clip.width = (unsigned short)titleRoom;
    clip.height = ROW_H;
    XSetClipRectangles(display, textGc, 0, 0, &clip, 1, Unsorted);
    XDrawString(display, shell, textGc, BAR_PAD, baseline, shown, (int)strlen(shown));
    XSetClipMask(display, textGc, None);
  }
  for (int i = 0; i < buttonCount; i++) {
    Button *button = &buttons[i];
    int lit = buttonLit(i);
    GC fill = buttonGc;
    if (button->accent) fill = lit ? pressedStopGc : stopGc;
    else if (paused && strcmp(button->command, "pause") == 0) fill = lit ? pressedAccentGc : accentGc;
    else if (lit) fill = pressedGc;
    XFillRectangle(display, shell, fill, button->x, button->y, (unsigned)button->w, (unsigned)button->h);
    int text = XTextWidth(font, button->label, (int)strlen(button->label));
    int textY = button->y + (lit ? 1 : 0);
    drawText(button->label, button->x + (button->w - text) / 2, textY, text + 2);
  }
  int labelBaseline = fieldY + (BUTTON_H + font->ascent - font->descent) / 2;
  if (progressLen > 0 && throttleLabelX > BAR_PAD + 8) {
    int room = throttleLabelX - BAR_PAD - 8;
    XRectangle clip;
    clip.x = BAR_PAD;
    clip.y = (short)fieldY;
    clip.width = (unsigned short)room;
    clip.height = (unsigned short)fieldH;
    XSetClipRectangles(display, textGc, 0, 0, &clip, 1, Unsorted);
    XDrawString(display, shell, textGc, BAR_PAD, labelBaseline, progressText, progressLen);
    XSetClipMask(display, textGc, None);
  }
  XDrawString(display, shell, textGc, throttleLabelX, labelBaseline, "Throttle", 8);
  XFillRectangle(display, shell, fieldGc, fieldX, fieldY, (unsigned)fieldW, (unsigned)fieldH);
  drawText(throttleText, fieldX + 8, fieldY, fieldW - 16);
  if (fieldFocused) {
    int caret = fieldX + 8 + XTextWidth(font, throttleText, throttleLen);
    XDrawLine(display, shell, textGc, caret, fieldY + 5, caret, fieldY + fieldH - 5);
  }
  XDrawString(display, shell, textGc, msX, labelBaseline, "ms", 2);
  int setLit = pressedSet || flashSet;
  XFillRectangle(display, shell, setLit ? pressedGc : buttonGc, setX, setY, (unsigned)setW, (unsigned)setH);
  int setText = XTextWidth(font, "Set", 3);
  drawText("Set", setX + (setW - setText) / 2, setY + (setLit ? 1 : 0), setText + 2);
  drawStatus();
  XFlush(display);
}

static void beginMove(int rootX, int rootY) {
  XEvent message;
  memset(&message, 0, sizeof message);
  message.xclient.type = ClientMessage;
  message.xclient.window = shell;
  message.xclient.message_type = XInternAtom(display, "_NET_WM_MOVERESIZE", False);
  message.xclient.format = 32;
  message.xclient.data.l[0] = rootX;
  message.xclient.data.l[1] = rootY;
  message.xclient.data.l[2] = 8; /* _NET_WM_MOVERESIZE_MOVE */
  message.xclient.data.l[3] = Button1;
  message.xclient.data.l[4] = 1;
  XSendEvent(
      display,
      DefaultRootWindow(display),
      False,
      SubstructureRedirectMask | SubstructureNotifyMask,
      &message);
  XFlush(display);
}

static void handleKey(XKeyEvent *key) {
  if (!fieldFocused) return;
  char buffer[8];
  KeySym keysym = 0;
  int count = XLookupString(key, buffer, (int)sizeof buffer, &keysym, NULL);
  if (keysym == XK_BackSpace || keysym == XK_Delete) {
    if (replaceOnType) {
      setThrottleText("0");
      replaceOnType = 0;
      redraw();
      return;
    }
    if (throttleLen > 0) throttleText[--throttleLen] = '\0';
    if (throttleLen == 0) setThrottleText("0");
    redraw();
    return;
  }
  if (keysym == XK_Return || keysym == XK_KP_Enter) {
    emitThrottle();
    return;
  }
  if (keysym == XK_Escape) {
    focusField(0, CurrentTime);
    redraw();
    return;
  }
  if (count == 1 && buffer[0] >= '0' && buffer[0] <= '9' && (replaceOnType || throttleLen < 5)) {
    if (replaceOnType || (throttleLen == 1 && throttleText[0] == '0')) {
      throttleLen = 0;
      replaceOnType = 0;
    }
    throttleText[throttleLen++] = buffer[0];
    throttleText[throttleLen] = '\0';
    redraw();
  }
}

static void handleEvent(XEvent *event) {
  if (event->type == Expose && event->xexpose.count == 0) {
    redraw();
    return;
  }
  if (event->type == KeyPress) {
    handleKey(&event->xkey);
    return;
  }
  if (event->type == ButtonPress && event->xbutton.button == Button1 && event->xbutton.window == shell) {
    int x = event->xbutton.x;
    int y = event->xbutton.y;
    if (hitField(x, y)) {
      pressed = -1;
      pressedSet = 0;
      focusField(1, event->xbutton.time);
      redraw();
      return;
    }
    if (fieldFocused) {
      focusField(0, CurrentTime);
      redraw();
    }
    if (hitSet(x, y)) {
      pressed = -1;
      flashButton = -1;
      flashSet = 0;
      pressedSet = 1;
      redraw();
      return;
    }
    int index = hitButton(x, y);
    if (index >= 0) {
      pressed = index;
      pressedSet = 0;
      flashButton = -1;
      flashSet = 0;
      redraw();
      return;
    }
    pressed = -1;
    pressedSet = 0;
    if (y < ROW_H) beginMove(event->xbutton.x_root, event->xbutton.y_root);
    return;
  }
  if (event->type == ButtonRelease && event->xbutton.button == Button1) {
    int x = event->xbutton.x;
    int y = event->xbutton.y;
    int released = pressed;
    int releasedSet = pressedSet;
    pressed = -1;
    pressedSet = 0;
    if (releasedSet && hitSet(x, y)) {
      armFlash(-1, 1);
      redraw();
      emitThrottle();
    } else if (released >= 0 && hitButton(x, y) == released) {
      armFlash(released, 0);
      redraw();
      emit(buttons[released].command);
    } else if (released >= 0 || releasedSet) {
      redraw();
    }
  }
}

static void applyHostLine(const char *line) {
  if (strcmp(line, "paused") == 0) paused = 1;
  else if (strcmp(line, "running") == 0) paused = 0;
  else if (strncmp(line, "throttle ", 9) == 0 && !fieldFocused) setThrottleText(line + 9);
  else if (strncmp(line, "status ", 7) == 0) setStatusText(line + 7);
  else if (strncmp(line, "progress ", 9) == 0) setProgressText(line + 9);
  else if (strcmp(line, "status") == 0) setStatusText("");
  else return;
  redraw();
}

static void setCardinal(Window window, const char *name, unsigned long value) {
  Atom property = XInternAtom(display, name, False);
  XChangeProperty(display, window, property, XA_CARDINAL, 32, PropModeReplace, (unsigned char *)&value, 1);
}

static void setAtom(Window window, const char *name, Atom value) {
  Atom property = XInternAtom(display, name, False);
  XChangeProperty(display, window, property, XA_ATOM, 32, PropModeReplace, (unsigned char *)&value, 1);
}

static XFontStruct *loadFont(void) {
  const char *candidates[] = {
      "-misc-fixed-medium-r-normal--14-130-75-75-c-70-iso8859-1",
      "9x15",
      "fixed",
      NULL,
  };
  for (int i = 0; candidates[i] != NULL; i++) {
    XFontStruct *loaded = XLoadQueryFont(display, candidates[i]);
    if (loaded) return loaded;
  }
  return NULL;
}

int main(int argc, char **argv) {
  if (argc != 7 || argv[5][0] == '\0') return 2;
  int x = atoi(argv[1]);
  int y = atoi(argv[2]);
  contentWidth = atoi(argv[3]);
  contentHeight = atoi(argv[4]);
  title = argv[5];
  setThrottleText(argv[6]);
  if (contentWidth < 1 || contentHeight < 1) return 2;

  display = XOpenDisplay(NULL);
  if (!display) {
    fprintf(stderr, "cannot open display\n");
    return 1;
  }
  int screen = DefaultScreen(display);
  font = loadFont();
  if (!font) {
    fprintf(stderr, "cannot load a title-bar font\n");
    XCloseDisplay(display);
    return 1;
  }
  layoutBar();
  int windowHeight = contentHeight + barHeight;

  unsigned long bar = rgb(screen, 0x2a, 0x26, 0x22);
  unsigned long button = rgb(screen, 0x3f, 0x39, 0x33);
  unsigned long pressedColor = rgb(screen, 0x6e, 0x62, 0x58);
  unsigned long field = rgb(screen, 0x1a, 0x17, 0x14);
  unsigned long accent = rgb(screen, 0x8a, 0x73, 0x40);
  unsigned long pressedAccent = rgb(screen, 0xb5, 0x96, 0x58);
  unsigned long stop = rgb(screen, 0x6e, 0x3a, 0x32);
  unsigned long pressedStop = rgb(screen, 0x8f, 0x51, 0x46);
  unsigned long ink = rgb(screen, 0xf4, 0xef, 0xe6);

  XSetWindowAttributes attributes;
  attributes.background_pixel = bar;
  attributes.event_mask = ExposureMask | ButtonPressMask | ButtonReleaseMask | KeyPressMask;
  shell = XCreateWindow(
      display,
      RootWindow(display, screen),
      x,
      y,
      (unsigned)contentWidth,
      (unsigned)windowHeight,
      0,
      CopyFromParent,
      InputOutput,
      CopyFromParent,
      CWBackPixel | CWEventMask,
      &attributes);

  XSetWindowAttributes contentAttributes;
  contentAttributes.background_pixel = BlackPixel(display, screen);
  content = XCreateWindow(
      display,
      shell,
      0,
      barHeight,
      (unsigned)contentWidth,
      (unsigned)contentHeight,
      0,
      CopyFromParent,
      InputOutput,
      CopyFromParent,
      CWBackPixel,
      &contentAttributes);

  Atom utf8 = XInternAtom(display, "UTF8_STRING", False);
  Atom netName = XInternAtom(display, "_NET_WM_NAME", False);
  XChangeProperty(
      display, shell, netName, utf8, 8, PropModeReplace, (const unsigned char *)title, (int)strlen(title));
  XStoreName(display, shell, title);

  XSizeHints size;
  memset(&size, 0, sizeof size);
  size.flags = USPosition | USSize | PMinSize | PMaxSize;
  size.x = x;
  size.y = y;
  size.width = contentWidth;
  size.height = windowHeight;
  size.min_width = contentWidth;
  size.min_height = windowHeight;
  size.max_width = contentWidth;
  size.max_height = windowHeight;

  XWMHints hints;
  memset(&hints, 0, sizeof hints);
  hints.flags = InputHint;
  hints.input = False;

  char resName[] = "pamsurin-tests";
  char resClass[] = "PamSurinTests";
  XClassHint classHint;
  classHint.res_name = resName;
  classHint.res_class = resClass;
  XSetWMProperties(display, shell, NULL, NULL, NULL, 0, &size, &hints, &classHint);

  unsigned long motif[5] = {MWM_HINTS_FUNCTIONS | MWM_HINTS_DECORATIONS, MWM_FUNC_MOVE, 0, 0, 0};
  Atom motifAtom = XInternAtom(display, "_MOTIF_WM_HINTS", False);
  XChangeProperty(display, shell, motifAtom, motifAtom, 32, PropModeReplace, (unsigned char *)motif, 5);
  setAtom(shell, "_NET_WM_WINDOW_TYPE", XInternAtom(display, "_NET_WM_WINDOW_TYPE_NORMAL", False));
  setCardinal(shell, "_NET_WM_USER_TIME", 0);

  backgroundGc = XCreateGC(display, shell, 0, NULL);
  buttonGc = XCreateGC(display, shell, 0, NULL);
  pressedGc = XCreateGC(display, shell, 0, NULL);
  accentGc = XCreateGC(display, shell, 0, NULL);
  pressedAccentGc = XCreateGC(display, shell, 0, NULL);
  stopGc = XCreateGC(display, shell, 0, NULL);
  pressedStopGc = XCreateGC(display, shell, 0, NULL);
  textGc = XCreateGC(display, shell, 0, NULL);
  fieldGc = XCreateGC(display, shell, 0, NULL);
  XSetForeground(display, backgroundGc, bar);
  XSetForeground(display, buttonGc, button);
  XSetForeground(display, pressedGc, pressedColor);
  XSetForeground(display, accentGc, accent);
  XSetForeground(display, pressedAccentGc, pressedAccent);
  XSetForeground(display, stopGc, stop);
  XSetForeground(display, pressedStopGc, pressedStop);
  XSetForeground(display, textGc, ink);
  XSetForeground(display, fieldGc, field);
  XSetFont(display, textGc, font->fid);

  layoutButtons();
  XMapWindow(display, content);
  XMapWindow(display, shell);
  XSync(display, False);
  redraw();
  /* Xephyr embeds in the area under the bar, so the controls stay visible. */
  printf("%lu\n", (unsigned long)content);
  fflush(stdout);

  int xfd = ConnectionNumber(display);
  int maxfd = xfd > STDIN_FILENO ? xfd : STDIN_FILENO;
  char input[2048];
  int filled = 0;
  for (;;) {
    while (XPending(display)) {
      XEvent event;
      XNextEvent(display, &event);
      handleEvent(&event);
    }
    fd_set reads;
    FD_ZERO(&reads);
    FD_SET(STDIN_FILENO, &reads);
    FD_SET(xfd, &reads);
    struct timeval flashWait;
    struct timeval *wait = NULL;
    if (flashButton >= 0 || flashSet) {
      struct timespec now;
      clock_gettime(CLOCK_MONOTONIC, &now);
      long sec = flashUntil.tv_sec - now.tv_sec;
      long nsec = flashUntil.tv_nsec - now.tv_nsec;
      if (nsec < 0) {
        sec -= 1;
        nsec += 1000000000L;
      }
      if (sec < 0) sec = 0;
      if (nsec < 0) nsec = 0;
      flashWait.tv_sec = sec;
      flashWait.tv_usec = nsec / 1000;
      wait = &flashWait;
    }
    int ready = select(maxfd + 1, &reads, NULL, NULL, wait);
    if (ready < 0) {
      if (errno == EINTR) continue;
      break;
    }
    if (ready == 0) {
      flashButton = -1;
      flashSet = 0;
      redraw();
      continue;
    }
    if (!FD_ISSET(STDIN_FILENO, &reads)) continue;
    if (filled >= (int)sizeof input) filled = 0;
    ssize_t count = read(STDIN_FILENO, input + filled, sizeof input - (size_t)filled);
    if (count <= 0) break;
    filled += (int)count;
    int start = 0;
    for (int i = 0; i < filled; i++) {
      if (input[i] != '\n') continue;
      input[i] = '\0';
      if (input[start] != '\0') applyHostLine(input + start);
      start = i + 1;
    }
    if (start > 0) {
      memmove(input, input + start, (size_t)(filled - start));
      filled -= start;
    }
  }

  XDestroyWindow(display, shell);
  XCloseDisplay(display);
  return 0;
}
