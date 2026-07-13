#!/usr/bin/env python3
"""ALGO CHASER v3 - Pygame edition (3 difficulty tiers).
Pure-Python simulation core (zero pygame in logic) so it is headless-verifiable;
pygame is used ONLY in the guarded __main__ render block. Same mechanics as the
HTML build: canonical Pac-Man maze + ghost houses, BFS ghost AI, scatter/chase,
fright (Root Access), fixed house-exit and eat-scoring. Run: python3 algo-chaser-v3.py
"""
import random, sys

# ---------------- Validated mazes (exact; do NOT regenerate) ----------------
L1 = [
"############################",
"#............##............#",
"#.####.#####.##.#####.####.#",
"#o####.#####.##.#####.####o#",
"#.####.#####.##.#####.####.#",
"#..........................#",
"#.####.##.########.##.####.#",
"#.####.##.########.##.####.#",
"#......##....##....##......#",
"######.#####.##.#####.######",
"######.#####.##.#####.######",
"#..........................#",
"######.##.###..###.##.######",
"######.##.###--###.##.######",
"######.##.#      #.##.######",
"          #      #          ",
"######.##.#      #.##.######",
"######.##.########.##.######",
"#..........................#",
"######.#####.##.#####.######",
"######.#####.##.#####.######",
"#......##....##....##......#",
"#.####.##.########.##.####.#",
"#.####.##.########.##.####.#",
"#o..##.......##.......##..o#",
"###.##.#####.##.#####.##.###",
"###.##.#####.##.#####.##.###",
"#......##....##....##......#",
"#.##########.##.##########.#",
"#..........................#",
"############################"]
L2 = [
"#################################",
"#...............................#",
"#.o.#.#.#.#.#.#.#.#.#.#.#.#.#.o.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#....#--#...............#--#....#",
"#.#.##  #.#.#.#.#.#.#.#.#  ##.#.#",
" ....#  #...............#  #.... ",
"#.#.#####.#.#.#.#.#.#.#.#####.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............................#",
"#.o.#.#.#.#.#.#.#.#.#.#.#.#.#.o.#",
"#...............................#",
"#################################"]
L3 = [
"#####################################",
"#...................................#",
"#.o.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.o.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...............#---#...............#",
"#.#.#.#.#.#.#.#.#   #.#.#.#.#.#.#.#.#",
"#...............#   #...............#",
"#.#.#.#.#.#.#.#.#####.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#......#--#...............#--#......#",
"#.#.#.##  #.#.#.#.#.#.#.#.#  ##.#.#.#",
" ......#  #...............#  #...... ",
"#.#.#.#####.#.#.#.#.#.#.#.#####.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
"#...................................#",
"#.o.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.o.#",
"#...................................#",
"#####################################"]

LEVELS = [
  dict(name="1 EASY", maze=L1, player=dict(x=13,y=18),
    houses=[dict(c0=11,c1=16,r0=14,r1=15, doorRow=13, doorCols=[13,14])],
    ghosts=[dict(type='bug',x=13,y=14,speed=1.0,home=0,scatter=dict(x=26,y=1)),
            dict(type='firewall',x=14,y=14,speed=1.0,home=0,scatter=dict(x=1,y=1)),
            dict(type='botnet',x=13,y=15,speed=1.0,home=0,scatter=dict(x=26,y=29)),
            dict(type='legacy',x=14,y=15,speed=0.6,home=0,scatter=dict(x=1,y=29))],
    exitDelays=dict(bug=0,firewall=40,botnet=80,legacy=120)),
  dict(name="2 MEDIUM", maze=L2, player=dict(x=16,y=29),
    houses=[dict(c0=6,c1=7,r0=16,r1=17,doorRow=15,doorCols=[6,7]),
            dict(c0=25,c1=26,r0=16,r1=17,doorRow=15,doorCols=[25,26])],
    ghosts=[dict(type='bug',x=6,y=16,speed=1.0,home=0,scatter=dict(x=31,y=1)),
            dict(type='firewall',x=7,y=16,speed=1.0,home=0,scatter=dict(x=1,y=1)),
            dict(type='botnet',x=6,y=17,speed=1.0,home=0,scatter=dict(x=31,y=33)),
            dict(type='legacy',x=7,y=17,speed=0.6,home=0,scatter=dict(x=1,y=33)),
            dict(type='trojan',x=25,y=16,speed=0.85,home=1,scatter=dict(x=31,y=33))],
    exitDelays=dict(bug=0,firewall=40,botnet=80,legacy=120,trojan=160)),
  dict(name="3 HARD", maze=L3, player=dict(x=18,y=25),
    houses=[dict(c0=8,c1=9,r0=18,r1=19,doorRow=17,doorCols=[8,9]),
            dict(c0=27,c1=28,r0=18,r1=19,doorRow=17,doorCols=[27,28]),
            dict(c0=17,c1=19,r0=10,r1=11,doorRow=9,doorCols=[17,18,19])],
    ghosts=[dict(type='bug',x=8,y=18,speed=1.0,home=0,scatter=dict(x=35,y=1)),
            dict(type='firewall',x=9,y=18,speed=1.0,home=0,scatter=dict(x=1,y=1)),
            dict(type='botnet',x=8,y=19,speed=1.0,home=0,scatter=dict(x=35,y=37)),
            dict(type='legacy',x=9,y=19,speed=0.6,home=0,scatter=dict(x=1,y=37)),
            dict(type='trojan',x=27,y=18,speed=0.85,home=1,scatter=dict(x=35,y=37)),
            dict(type='daemon',x=17,y=10,speed=1.0,home=2,scatter=dict(x=1,y=1))],
    exitDelays=dict(bug=0,firewall=40,botnet=80,legacy=120,trojan=160,daemon=200)),
]

TS=28
DIRS=[dict(x=0,y=-1),dict(x=0,y=1),dict(x=-1,y=0),dict(x=1,y=0)]
PHASES=[7,20,7,20,5,20,5]
COLORS=dict(bug=(255,59,59),firewall=(255,91,208),botnet=(41,240,255),legacy=(255,159,28),trojan=(207,214,230),daemon=(177,74,255))

class Game:
    def __init__(self): self.hi=0; self.reset(0)
    # ---- helpers ----
    def house_of(self,g): return self.houses[g['home']]
    def in_house(self,x,y): return any(h['c0']<=x<=h['c1'] and h['r0']<=y<=h['r1'] for h in self.houses)
    def home_center(self,h): return dict(x=h['doorCols'][len(h['doorCols'])//2], y=h['doorRow']-1)
    def cell_at(self,x,y):
        if x<0 or y<0 or x>=self.cols or y>=self.rows: return '#'
        return self.maze[y][x]
    def is_wall(self,x,y): return self.cell_at(x,y)=='#'
    def is_walkable(self,x,y): c=self.cell_at(x,y); return c!='#' and c!='-'
    def wrap_x(self,x):
        if x<0: return self.cols-1
        if x>=self.cols: return 0
        return x
    def rev(self,d): return dict(x=-d['x'],y=-d['y'])
    def clamp_c(self,c): return max(1,min(self.cols-2,c))
    def clamp_r(self,r): return max(1,min(self.rows-2,r))

    def reset(self,lv=0):
        lv=lv%len(LEVELS); self.level=lv; L=LEVELS[lv]
        self.maze=[list(r) for r in L['maze']]; self.cols=len(self.maze[0]); self.rows=len(self.maze)
        self.houses=L['houses']; self.exit_delays=L['exitDelays']
        self.scatter={g['type']:g['scatter'] for g in L['ghosts']}
        self.total_dots=sum(1 for r in self.maze for c in r if c in '.o')
        self.dots_left=self.total_dots
        self.score=0; self.lives=3; self.processing=0
        self.state='play'; self.paused=False; self.mode='scatter'; self.phase_idx=0; self.phase_timer=PHASES[0]*60
        self.fright_timer=0; self.ghost_combo=200
        p=L['player']; self.player=self.mk_ent(p['x'],p['y'],1.0)
        self.ghosts=[self.mk_ghost(g) for g in L['ghosts']]

    def start_level(self,lv): self.reset(lv)
    def mk_ent(self,x,y,speed): return dict(gridX=x,gridY=y,offset=0,dir=dict(x=0,y=0),desired=dict(x=0,y=0),speed=speed,px=0,py=0,inHouse=False)
    def mk_ghost(self,spec):
        g=self.mk_ent(spec['x'],spec['y'],spec['speed']); g['type']=spec['type']; g['home']=spec.get('home',0)
        g['scatter']=spec['scatter']; g['frightened']=False; g['eyes']=False
        g['inHouse']=self.in_house(spec['x'],spec['y']); g['exitDelay']=self.exit_delays.get(spec['type'],0)
        return g

    # ---- movement core: re-decide on tile arrival (all speeds) ----
    def step_entity(self,e,decide):
        if not (e['dir']['x'] or e['dir']['y']): decide(e)
        else:
            e['offset']+=e['speed']
            if e['offset']>=TS:
                e['offset']-=TS; e['gridX']=self.wrap_x(e['gridX']+e['dir']['x']); e['gridY']+=e['dir']['y']; decide(e)
        e['px']=e['gridX']*TS+TS/2+e['dir']['x']*e['offset']
        e['py']=e['gridY']*TS+TS/2+e['dir']['y']*e['offset']

    def decide_player(self,e):
        d=e['desired']
        if (d['x'] or d['y']) and self.is_walkable(e['gridX']+d['x'],e['gridY']+d['y']): e['dir']=dict(d)

    def valid_dirs(self,x,y,cur,allow_rev,allow_door_up,allow_door_down):
        opts=[]
        for d in DIRS:
            nx=self.wrap_x(x+d['x']); ny=y+d['y']; c=self.cell_at(nx,ny)
            if c!='#' and c!='-': opts.append(d)
            elif c=='-' and d['y']==-1 and allow_door_up: opts.append(d)
            elif c=='-' and d['y']==1 and allow_door_down: opts.append(d)
        if not allow_rev: opts=[d for d in opts if not (d['x']==-cur['x'] and d['y']==-cur['y'])]
        if not opts:
            r=self.rev(cur); rc=self.cell_at(self.wrap_x(x+r['x']),y+r['y'])
            if rc!='#' and rc!='-': opts.append(r)
        return opts

    def dist_field(self,goal):
        gy=max(0,min(self.rows-1,goal['y'])); gx=max(0,min(self.cols-1,goal['x']))
        dist=[[10**9]*self.cols for _ in range(self.rows)]
        q=[[gx,gy]]; dist[gy][gx]=0; h=0
        while h<len(q):
            x,y=q[h]; h+=1
            for d in DIRS:
                nx=self.wrap_x(x+d['x']); ny=y+d['y']
                if ny<0 or ny>=self.rows: continue
                if dist[ny][nx]!=10**9: continue
                if ny==self.houses[0]['doorRow'] and (nx==0 or nx==self.cols-1):
                    o=self.cols-1 if nx==0 else 0
                    if dist[ny][o]==10**9 and self.cell_at(o,ny)!='#': dist[ny][o]=dist[y][x]+1; q.append([o,ny])
                    continue
                if self.cell_at(nx,ny)!='#': dist[ny][nx]=dist[y][x]+1; q.append([nx,ny])
        return dist

    def ghost_goal(self,g):
        if self.mode=='scatter': return g['scatter']
        p=self.player
        if g['type']=='firewall':
            tx=p['gridX']+p['dir']['x']*4; ty=p['gridY']+p['dir']['y']*4
            if not (p['dir']['x'] or p['dir']['y']): ty=p['gridY']-4
            return dict(x=self.clamp_c(tx),y=self.clamp_r(ty))
        if g['type']=='botnet':
            bug=next((x for x in self.ghosts if x['type']=='bug'),p)
            ax=p['gridX']+p['dir']['x']*2; ay=p['gridY']+p['dir']['y']*2
            return dict(x=self.clamp_c(bug['gridX']+(ax-bug['gridX'])*2),y=self.clamp_r(bug['gridY']+(ay-bug['gridY'])*2))
        if g['type']=='legacy':
            d=((g['gridX']-p['gridX'])**2+(g['gridY']-p['gridY'])**2)**0.5
            return dict(x=p['gridX'],y=p['gridY']) if d>8 else g['scatter']
        if g['type']=='trojan':
            return dict(x=p['gridX'],y=p['gridY']) if p['gridY']>self.rows/2 else g['scatter']
        if g['type']=='daemon':
            return dict(x=self.cols-1-p['gridX'],y=p['gridY'])
        return dict(x=p['gridX'],y=p['gridY'])

    def decide_ghost(self,g):
        if g['inHouse'] and not g['eyes'] and not self.in_house(g['gridX'],g['gridY']): g['inHouse']=False
        if g['eyes']:
            h=self.house_of(g)
            goal=self.home_center(h) if self.in_house(g['gridX'],g['gridY']) else dict(x=(h['c0']+h['c1'])//2,y=(h['r0']+h['r1'])//2)
            opts=self.valid_dirs(g['gridX'],g['gridY'],g['dir'],True,True,not self.in_house(g['gridX'],g['gridY']))
            if not opts: return
            f=self.dist_field(goal); best=opts[0]; bd=10**9
            for d in opts:
                nx=self.wrap_x(g['gridX']+d['x']); ny=g['gridY']+d['y']; dd=f[ny][nx]
                if dd<bd: bd=dd; best=d
            g['dir']=best
            if self.in_house(g['gridX'],g['gridY']) and g['gridY']>=(h['r0']+h['r1'])//2:
                g['eyes']=False; g['frightened']=False; g['inHouse']=True; g['exitDelay']=60
            return
        if g['inHouse']:
            if g['exitDelay']>0: g['exitDelay']-=1; g['dir']=dict(x=0,y=0); return
            h=self.house_of(g); goal=self.home_center(h)
            opts=self.valid_dirs(g['gridX'],g['gridY'],g['dir'],True,True,False)
            if not opts: g['dir']=dict(x=0,y=0); return
            f=self.dist_field(goal); best=opts[0]; bd=10**9
            for d in opts:
                nx=self.wrap_x(g['gridX']+d['x']); ny=g['gridY']+d['y']; dd=f[ny][nx]
                if dd<bd: bd=dd; best=d
            g['dir']=best
            if g['gridY']<h['doorRow']: g['inHouse']=False
            return
        if g['frightened']:
            opts=self.valid_dirs(g['gridX'],g['gridY'],g['dir'],True,False,False)
            if opts: g['dir']=random.choice(opts)
            return
        if g['type']=='bug' and random.random()<0.10:
            o=self.valid_dirs(g['gridX'],g['gridY'],g['dir'],False,False,False)
            if o: g['dir']=random.choice(o); return
        goal=self.ghost_goal(g); opts=self.valid_dirs(g['gridX'],g['gridY'],g['dir'],False,False,False)
        if not opts: return
        f=self.dist_field(goal); best=opts[0]; bd=10**9
        for d in opts:
            nx=self.wrap_x(g['gridX']+d['x']); ny=g['gridY']+d['y']; dd=f[ny][nx]
            if dd<bd: bd=dd; best=d
        g['dir']=best

    def activate_fright(self):
        self.fright_timer=7*60; self.ghost_combo=200
        for g in self.ghosts:
            if not g['eyes']:
                g['frightened']=True
                if g['dir']['x'] or g['dir']['y']: g['dir']=self.rev(g['dir'])
    def eat_ghost(self,g):
        self.score+=self.ghost_combo; self.ghost_combo=min(self.ghost_combo*2,1600)
        g['eyes']=True; g['frightened']=False; g['inHouse']=False

    def update(self):
        if self.state!='play' or self.paused: return
        self.phase_timer-=1
        if self.phase_timer<=0:
            if self.phase_idx<len(PHASES)-1:
                self.phase_idx+=1; self.mode='chase' if self.mode=='scatter' else 'scatter'; self.phase_timer=PHASES[self.phase_idx]*60
            else: self.mode='chase'; self.phase_timer=10**9
        if self.fright_timer>0:
            self.fright_timer-=1
            if self.fright_timer<=0:
                for g in self.ghosts: g['frightened']=False
        self.step_entity(self.player,self.decide_player)
        for g in self.ghosts: self.step_entity(g,self.decide_ghost)
        t=self.maze[self.player['gridY']][self.player['gridX']]
        if t=='.': self.maze[self.player['gridY']][self.player['gridX']]=' '; self.score+=10; self.dots_left-=1; self.processing=min(100,self.processing+100/300)
        elif t=='o': self.maze[self.player['gridY']][self.player['gridX']]=' '; self.score+=50; self.dots_left-=1; self.processing=min(100,self.processing+25); self.activate_fright()
        for g in self.ghosts:
            if g['eyes']: continue
            same=g['gridX']==self.player['gridX'] and g['gridY']==self.player['gridY']
            dx=g['px']-self.player['px']; dy=g['py']-self.player['py']
            overlap=(dx*dx+dy*dy)<(TS*0.6)**2
            if same or overlap:
                if g['frightened']: self.eat_ghost(g)
                else:
                    self.lives-=1
                    if self.lives<=0: self.state='over'
                    else: self.respawn()
                    break
        if self.dots_left<=0: self.state='win'
        if self.score>self.hi: self.hi=self.score

    def respawn(self):
        L=LEVELS[self.level]; p=L['player']
        self.player['gridX']=p['x']
        self.player['gridY']=p['y']
        self.player['offset']=0
        self.player['dir']=dict(x=0,y=0)
        self.player['desired']=dict(x=0,y=0)
        for g,s in zip(self.ghosts,L['ghosts']):
            g['gridX']=s['x']
            g['gridY']=s['y']
            g['offset']=0
            g['dir']=dict(x=0,y=0)
            g['frightened']=False
            g['eyes']=False
            g['inHouse']=self.in_house(s['x'],s['y'])
            g['exitDelay']=self.exit_delays.get(s['type'],0)
        self.fright_timer=0

    # ---- headless API ----
    def set_desired(self,dx,dy): self.player['desired']=dict(x=dx,y=dy)
    def force_fright(self): self.activate_fright()
    def place_frightened_on_player(self):
        g=self.ghosts[1]; g['frightened']=True; g['eyes']=False; g['inHouse']=False
        g['gridX']=self.player['gridX']; g['gridY']=self.player['gridY']; g['offset']=0; g['dir']=dict(x=0,y=0); g['px']=self.player['px']; g['py']=self.player['py']
        self.maze[self.player['gridY']][self.player['gridX']]=' '
    def get_state(self):
        return dict(level=self.level,score=self.score,hi=self.hi,lives=self.lives,processing=self.processing,
                    dotsLeft=self.dots_left,totalDots=self.total_dots,state=self.state,mode=self.mode,
                    frightTimer=self.fright_timer,ghostCombo=self.ghost_combo,phaseIdx=self.phase_idx,paused=self.paused,
                    cols=self.cols,rows=self.rows,
                    player=dict(x=self.player['gridX'],y=self.player['gridY'],px=self.player['px'],py=self.player['py'],dir=self.player['dir'],desired=self.player['desired']),
                    ghosts=[dict(type=g['type'],x=g['gridX'],y=g['gridY'],px=g['px'],py=g['py'],dir=g['dir'],frightened=g['frightened'],eyes=g['eyes'],inHouse=g['inHouse']) for g in self.ghosts],
                    maze=self.maze)

# ---------------- guarded pygame render (only if pygame installed) ----------------
def main():
    try: import pygame
    except Exception as e:
        print("pygame not installed - running logic only. To play, install pygame."); return
    pygame.init(); g=Game()
    W=g.cols*TS; H=g.rows*TS; screen=pygame.display.set_mode((W,H)); pygame.display.set_caption("ALGO CHASER v3")
    clock=pygame.time.Clock(); font=pygame.font.SysFont("Courier New",16)
    running=True
    while running:
        for ev in pygame.event.get():
            if ev.type==pygame.QUIT: running=False
            elif ev.type==pygame.KEYDOWN:
                k=ev.key
                if k==pygame.K_UP: g.player['desired']=dict(x=0,y=-1)
                elif k==pygame.K_DOWN: g.player['desired']=dict(x=0,y=1)
                elif k==pygame.K_LEFT: g.player['desired']=dict(x=-1,y=0)
                elif k==pygame.K_RIGHT: g.player['desired']=dict(x=1,y=0)
                elif k in (pygame.K_1,pygame.K_2,pygame.K_3): g.start_level(k-pygame.K_1)
                elif k==pygame.K_r: g.start_level(g.level)
                elif k==pygame.K_p: g.paused=not g.paused
        g.update(); screen.fill((4,6,12))
        for r in range(g.rows):
            for c in range(g.cols):
                ch=g.maze[r][c]; x=c*TS; y=r*TS
                if ch=='#': pygame.draw.rect(screen,(8,22,30),(x+2,y+2,TS-4,TS-4)); pygame.draw.rect(screen,(43,209,255),(x+3,y+3,TS-6,TS-6),2)
                elif ch=='-': pygame.draw.line(screen,(255,91,208),(x+3,y+TS//2),(x+TS-3,y+TS//2),3)
                elif ch=='.': pygame.draw.rect(screen,(57,255,20),(x+TS//2-2,y+TS//2-2,4,4))
                elif ch=='o': pygame.draw.circle(screen,(177,74,255),(x+TS//2,y+TS//2),7)
        px=g.player['px']; py=g.player['py']
        hexagon=[]
        for i in range(6):
            a=i*3.14159/3-3.14159/6
            hexagon.append((px+12*cos(a),py+12*sin(a)))
        pygame.draw.polygon(screen,(43,209,255),hexagon)
        for gh in g.ghosts:
            col=COLORS.get(gh['type'],(200,200,200))
            if gh['frightened']: col=(27,59,255)
            elif gh['eyes']: col=(0,0,0)
            pygame.draw.circle(screen,col,(int(gh['px']),int(gh['py'])),10)
        if g.state!='play':
            over=font.render("SYSTEM PURGED" if g.state=='win' else "KERNEL PANIC",True,(43,209,255))
            screen.blit(over,(W//2-80,H//2))
        pygame.display.flip(); clock.tick(60)
    pygame.quit()

if __name__=='__main__':
    from math import cos,sin
    main()
