/* Keel — actions: every mutation the UI is allowed to make.
   Keeping them here means screens stay presentational and each change has
   one name, which is also the label shown when you undo it. */
(function (K) {
  'use strict';

  const U = K.Util, M = K.Model;

  function bind(store) {
    const A = {};

    function s() { return store.state; }
    function touch(o) { o.updatedAt = store.today(); return o; }

    /* ------------------------------------------------------------ focus */

    A.setFocus = function (day, text) {
      store.patch(function (st) {
        if (!text) delete st.focus[day];
        else st.focus[day] = { text: text, done: (st.focus[day] || {}).done || false };
      }, 'focus');
    };

    A.toggleFocusDone = function (day) {
      store.commit('focus', function (st) {
        const f = st.focus[day];
        if (f) f.done = !f.done;
      });
    };

    /* ----------------------------------------------------------- habits */

    A.toggleHabit = function (habitId, day) {
      store.commit('habit tick', function (st) {
        const d = st.habitLog[day] || (st.habitLog[day] = {});
        if (d[habitId]) {
          delete d[habitId];
          if (!Object.keys(d).length) delete st.habitLog[day];
        } else {
          d[habitId] = true;
        }
      });
    };

    A.addHabit = function (fields) {
      const h = M.habit(Object.assign({ order: s().habits.length }, fields));
      store.commit('add habit', function (st) { st.habits.push(h); });
      return h;
    };

    A.updateHabit = function (id, fields) {
      store.commit('edit habit', function (st) {
        const h = find(st.habits, id);
        if (h) Object.assign(h, M.habit(Object.assign({}, h, fields)));
      });
    };

    A.archiveHabit = function (id) {
      store.commit('archive habit', function (st) {
        const h = find(st.habits, id);
        if (h) h.archived = true;
      });
    };

    A.deleteHabit = function (id) {
      store.commit('delete habit', function (st) {
        st.habits = st.habits.filter(function (h) { return h.id !== id; });
        Object.keys(st.habitLog).forEach(function (day) {
          delete st.habitLog[day][id];
          if (!Object.keys(st.habitLog[day]).length) delete st.habitLog[day];
        });
      });
    };

    A.reorderHabits = function (ids) {
      store.commit('reorder habits', function (st) {
        ids.forEach(function (id, i) {
          const h = find(st.habits, id);
          if (h) h.order = i;
        });
      });
    };

    /* ------------------------------------------------------------ tasks */

    A.addTask = function (fields) {
      const t = M.task(Object.assign({ createdAt: store.today() }, fields));
      store.commit('add task', function (st) { st.tasks.unshift(t); });
      return t;
    };

    A.updateTask = function (id, fields) {
      store.commit('edit task', function (st) {
        const t = find(st.tasks, id);
        if (t) Object.assign(t, M.task(Object.assign({}, t, fields)));
      });
    };

    A.toggleTask = function (id) {
      store.commit('task', function (st) {
        const t = find(st.tasks, id);
        if (!t) return;
        t.done = !t.done;
        t.doneDate = t.done ? store.today() : null;
      });
    };

    A.deleteTask = function (id) {
      store.commit('delete task', function (st) {
        st.tasks = st.tasks.filter(function (t) { return t.id !== id; });
      });
    };

    A.clearCompletedTasks = function () {
      store.commit('clear completed', function (st) {
        st.tasks = st.tasks.filter(function (t) { return !t.done; });
      });
    };

    A.addProject = function (fields) {
      const p = M.project(fields);
      store.commit('add project', function (st) { st.projects.push(p); });
      return p;
    };

    A.updateProject = function (id, fields) {
      store.commit('edit project', function (st) {
        const p = find(st.projects, id);
        if (p) Object.assign(p, M.project(Object.assign({}, p, fields)));
      });
    };

    A.deleteProject = function (id) {
      store.commit('delete project', function (st) {
        st.projects = st.projects.filter(function (p) { return p.id !== id; });
        // Tasks survive their project; they just become loose.
        st.tasks.forEach(function (t) { if (t.projectId === id) t.projectId = null; });
      });
    };

    /* ---------------------------------------------------------- check-in */

    A.setCheckin = function (day, fields) {
      store.patch(function (st) {
        const merged = M.checkin(Object.assign({}, st.checkins[day] || {}, fields));
        const empty = ['sleepHours', 'energy', 'mood', 'exerciseMins', 'weightKg', 'water']
          .every(function (f) { return merged[f] === null; }) && !merged.note;
        if (empty) delete st.checkins[day];
        else st.checkins[day] = merged;
      }, 'checkin');
    };

    A.clearCheckin = function (day) {
      store.commit('clear check-in', function (st) { delete st.checkins[day]; });
    };

    /* ---------------------------------------------------------- journal */

    A.setJournal = function (day, fields) {
      store.patch(function (st) {
        const merged = M.journalEntry(Object.assign({}, st.journal[day] || {}, fields));
        merged.updatedAt = new Date().toISOString();
        if (!merged.text && !merged.win && !merged.grateful && !merged.lesson) delete st.journal[day];
        else st.journal[day] = merged;
      }, 'journal');
    };

    /* ------------------------------------------------------------ money */

    A.setCash = function (pence) {
      store.commit('update cash', function (st) {
        st.money.cashPence = Math.round(pence);
        st.money.cashUpdated = store.today();
      });
    };

    A.addTransaction = function (fields) {
      const t = M.transaction(Object.assign({ date: store.today() }, fields));
      store.commit('add transaction', function (st) { st.money.transactions.unshift(t); });
      return t;
    };

    A.updateTransaction = function (id, fields) {
      store.commit('edit transaction', function (st) {
        const t = find(st.money.transactions, id);
        if (t) Object.assign(t, M.transaction(Object.assign({}, t, fields)));
      });
    };

    A.deleteTransaction = function (id) {
      store.commit('delete transaction', function (st) {
        st.money.transactions = st.money.transactions.filter(function (t) { return t.id !== id; });
      });
    };

    A.addRecurring = function (fields) {
      const r = M.recurring(fields);
      store.commit('add recurring item', function (st) { st.money.recurring.push(r); });
      return r;
    };

    A.updateRecurring = function (id, fields) {
      store.commit('edit recurring item', function (st) {
        const r = find(st.money.recurring, id);
        if (r) Object.assign(r, M.recurring(Object.assign({}, r, fields)));
      });
    };

    A.deleteRecurring = function (id) {
      store.commit('delete recurring item', function (st) {
        st.money.recurring = st.money.recurring.filter(function (r) { return r.id !== id; });
      });
    };

    A.addGoal = function (fields) {
      const g = M.goal(fields);
      store.commit('add goal', function (st) { st.money.goals.push(g); });
      return g;
    };

    A.updateGoal = function (id, fields) {
      store.commit('edit goal', function (st) {
        const g = find(st.money.goals, id);
        if (g) Object.assign(g, M.goal(Object.assign({}, g, fields)));
      });
    };

    A.contributeToGoal = function (id, pence) {
      store.commit('add to goal', function (st) {
        const g = find(st.money.goals, id);
        if (g) g.savedPence = Math.max(0, g.savedPence + Math.round(pence));
      });
    };

    A.deleteGoal = function (id) {
      store.commit('delete goal', function (st) {
        st.money.goals = st.money.goals.filter(function (g) { return g.id !== id; });
      });
    };

    /* ------------------------------------------------------------- work */

    A.addApplication = function (fields) {
      const a = M.application(Object.assign({ appliedDate: store.today() }, fields));
      a.updatedAt = store.today();
      store.commit('add application', function (st) { st.applications.unshift(a); });
      return a;
    };

    A.updateApplication = function (id, fields) {
      store.commit('edit application', function (st) {
        const a = find(st.applications, id);
        if (a) Object.assign(a, touch(M.application(Object.assign({}, a, fields))));
      });
    };

    // Moving stage is also contact, so the follow-up clock resets with it.
    A.setApplicationStatus = function (id, status) {
      store.commit('move application', function (st) {
        const a = find(st.applications, id);
        if (!a) return;
        a.status = status;
        a.updatedAt = store.today();
        a.lastContact = store.today();
      });
    };

    A.deleteApplication = function (id) {
      store.commit('delete application', function (st) {
        st.applications = st.applications.filter(function (a) { return a.id !== id; });
      });
    };

    A.addGig = function (fields) {
      const g = M.gig(fields);
      g.updatedAt = store.today();
      store.commit('add job', function (st) { st.gigs.unshift(g); });
      return g;
    };

    A.updateGig = function (id, fields) {
      store.commit('edit job', function (st) {
        const g = find(st.gigs, id);
        if (g) Object.assign(g, touch(M.gig(Object.assign({}, g, fields))));
      });
    };

    A.setGigStatus = function (id, status) {
      store.commit('move job', function (st) {
        const g = find(st.gigs, id);
        if (!g) return;
        g.status = status;
        g.updatedAt = store.today();
        // Marking a job paid records the income, so freelance earnings show
        // up in the money screens without being entered twice.
        if (status === 'paid') {
          if (g.paidPence < g.quotedPence) g.paidPence = g.quotedPence;
          const already = st.money.transactions.some(function (t) {
            return t.notes === 'gig:' + g.id;
          });
          if (!already && g.paidPence > 0) {
            st.money.transactions.unshift(M.transaction({
              date: store.today(),
              label: g.client + (g.title ? ' — ' + g.title : ''),
              kind: 'income',
              stream: 'freelance',
              amountPence: g.paidPence,
              notes: 'gig:' + g.id
            }));
          }
        }
      });
    };

    A.deleteGig = function (id) {
      store.commit('delete job', function (st) {
        st.gigs = st.gigs.filter(function (g) { return g.id !== id; });
      });
    };

    /* ----------------------------------------------------------- review */

    A.saveReview = function (weekKey, fields) {
      store.patch(function (st) {
        let r = null;
        for (let i = 0; i < st.reviews.length; i++) {
          if (st.reviews[i].weekKey === weekKey) { r = st.reviews[i]; break; }
        }
        if (!r) {
          r = M.review(Object.assign({ weekKey: weekKey }, fields));
          st.reviews.push(r);
        } else {
          Object.assign(r, M.review(Object.assign({}, r, fields, { weekKey: weekKey })));
        }
      }, 'review');
    };

    /* --------------------------------------------------------- settings */

    A.updateSettings = function (fields) {
      store.commit('change settings', function (st) {
        Object.assign(st.settings, fields);
      });
    };

    A.updateProfile = function (fields) {
      store.patch(function (st) { Object.assign(st.profile, fields); }, 'profile');
    };

    A.dismissOnboarding = function () {
      store.commit('dismiss welcome', function (st) { st.settings.showOnboarding = false; });
    };

    function find(list, id) {
      for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }

    store.actions = A;
    return A;
  }

  K.Actions = { bind: bind };
})(globalThis.Keel = globalThis.Keel || {});
