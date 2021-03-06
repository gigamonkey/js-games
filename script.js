import { $, clear, findDescendant, withClass } from "./whjqah.js";
import { forBlank, type } from "./questions.js";
import { random as g } from "./random.js";
import { first } from "./async.js";

// Basic functionality:
//
//  - Generate some number of potential answers.
//  - Choose one at random and then create an expression using that answer.
//  - Present the question with the answer blanked out.
//  - User clicks on button to select answer and then we report whether it was correct.
//  - Any answer that produces the same result is ok.

//////////////////////////////////////////////////////////////////////
// HTML

let model = {
  currentAnswers: {},
  currentQuestion: null,
  answeredCorrectly: false,
  currentFilter: "all",
  tiles: 4,
  level: 3, // N.B. we're not doing anything with this at the moment.
  correct: 0,
  asked: 0,
  tries: 0,
};

function init() {
  clear($("#results"));
  $("#toggle_info").onclick = visibilityToggler("#info");
  $("#close_info").onclick = (e) => ($("#info").style.display = "none");
  $("#toggle_results").onclick = visibilityToggler("#log");
  $("#results_header").onclick = changeFilter;
  setQuestion();
}

function visibilityToggler(id) {
  return function (e) {
    const element = $(id);
    element.style.display = element.style.display == "none" ? "block" : "none";
  };
}

let filters = ["all", "pass", "fail"];
let filterLabels = {
  all: "All",
  pass: "✅",
  fail: "❌",
};

function changeFilter(e) {
  let f = filters[(filters.indexOf(model.currentFilter) + 1) % filters.length];
  let result = $("#results");
  for (let row = result.firstChild; row; row = row.nextSibling) {
    let c = row.className;
    row.style.display = rowVisible(f, c) ? "table-row" : "none";
  }
  e.target.innerText = filterLabels[f];
  model.currentFilter = f;
}

function rowVisible(filter, className) {
  return filter === "all" || filter === className;
}

function newTiles() {
  clear($("#answers"));
  model.currentAnswers = {};
  for (let i = 0; i < model.tiles; i++) {
    addTile(newAnswer());
  }
}

function maybeSetQuestion() {
  if (model.answeredCorrectly) {
    setQuestion();
  } else {
    resetQuestion();
  }
}

function setQuestion() {
  clear($("#commentary"));
  newTiles();
  model.asked++;
  model.answeredCorrectly = false;
  const answers = Object.values(model.currentAnswers);
  let a = g.choice(answers);
  let expr = forBlank(a);
  model.currentQuestion = expr;
  showExpression(expr, clear($("#question")));
}

function resetQuestion() {
  showExpression(model.currentQuestion, clear($("#question")));
}

function onAnswer(e) {
  model.tries++;
  const answer = JSON.parse(e.target.value);
  const result = processAnswer(model.currentQuestion, answer);
  if (!result.passed) {
    disableTile(e.target);
  } else {
    model.correct++;
  }
  updateScore();
  animateExpression(result, $("#question"));
  logResult(result);
  maybeHideTip();
}

function plural(word, n) {
  if (n === 1) {
    return word;
  } else {
    if (word[word.length - 1] == "y") {
      return word.substring(0, word.length - 1) + "ies";
    } else {
      return word + "s";
    }
  }
}

function updateScore() {
  let a = model.asked;
  let c = model.correct;
  let t = model.tries;
  let accuracy = Math.round((100 * c) / t);

  $("#score").innerHTML = `${accuracy}% accuracy over ${a} ${plural("question", a)}.`;
}

function maybeHideTip() {
  const tip = $("#tip");

  if (tip.style.display != "none") {
    let iters = 50;
    let h = tip.clientHeight;
    let w = tip.clientWidth;
    let hd = h / iters;
    let wd = w / iters;

    let id = null;
    function shrinkTip() {
      tip.innerHTML = "";
      if (iters == 0) {
        tip.style.display = "none";
        clearInterval(id);
      } else {
        iters--;
        h -= hd;
        w -= wd;
        tip.style.height = h + "px";
        tip.style.width = w + "px";
      }
    }
    id = setInterval(shrinkTip, 10);
  }
}

function processAnswer(expr, answer) {
  // We can't just compare the answer we got to the answer
  // we used to create the question because there could be
  // multiple answers that would get the same result (e.g.
  // consider ? * 0 ==> 0.)

  // Things to check:
  //
  // - Was the selected answer an acceptable type for the operator
  //   given the other value.
  //
  // - Does evaluating the expression with the selected answer
  //   yield the same result.
  //
  // The former does not necessarily require that the answer is the same type
  // as the value in the blank--in an === or !== any value is a plausible type.
  // (I'm ignoring the legality of types after coercion so no numbers to && or
  // booleans to +, etc.)
  //

  const blankValue = expr.blankValue();
  const expectedValue = expr.evaluate();
  const filled = expr.fillBlank(answer);
  const answeredValue = filled.evaluate();
  const typeOk = expr.okTypes.indexOf(type(answer)) != -1;
  const valueRight = answeredValue === expectedValue;

  return {
    expr: expr,
    inBlank: blankValue,
    answer: answer,
    filled: filled,
    expectedValue: expectedValue,
    answeredValue: answeredValue,
    typeOk: typeOk,
    exactType: type(blankValue) === type(answer),
    valueRight: valueRight,
    passed: typeOk && valueRight,
  };
}

function a(t) {
  // Hard wired for the type names. Kludge.
  return (t === "array" ? "an " : "a ") + t;
}

function or(things) {
  if (things.length == 1) {
    return things[0];
  } else if (things.length == 2) {
    return things.join(" or ");
  } else {
    return things.slice(0, things.length - 1).join(", ") + ", or " + things[things.length - 1];
  }
}

function addCommentary(result, where, prefix) {
  const p = $("<p>");
  if (prefix) p.append(prefix);
  where.append(p);

  p.append(withClass("mono", $("<span>", JSON.stringify(result.answer))));

  if (result.passed) {
    p.append($(" is correct!"));
  } else {
    let answerType = type(result.answer);
    if (!result.typeOk) {
      let expectation = or(result.expr.okTypes.map(a));
      p.append($(` is ${a(answerType)}, not ${expectation}.`));
    } else {
      if (result.exactType) {
        p.append($(" is the right type but isn't quite the right value. "));
        showExpression(result.filled, p);
      } else {
        let needed = a(type(result.inBlank));
        p.append($(`, ${a(answerType)}, is of an acceptable type for the operator `));
        p.append(`but in this case you probably needed ${needed}.`);
      }
    }
  }
}

function logResult(result) {
  const row = $("#results").insertRow(0);
  row.className = result.passed ? "pass" : "fail";

  let [ok, question, notes] = Array(3)
    .fill()
    .map(() => row.insertCell());

  ok.append($(result.passed ? "✅" : "❌"));
  showExpression(result.expr, question);
  addCommentary(result, notes);
}

function animateExpression(result, where) {
  let hole = findDescendant(where, (c) => c.className == "hole");
  let value = findDescendant(where, (c) => c.className == "value");

  function checkmark() {
    if (result.passed) {
      hole.parentElement.replaceChild($(JSON.stringify(result.answer)), hole);
      value.append($(" ✅"));
      model.answeredCorrectly = true;
    } else {
      addCommentary(result, $("#commentary"), $("❌ "));
    }
  }

  first(checkmark).after(1500, maybeSetQuestion).run();
}

function showExpression(expr, where) {
  const s1 = withClass("mono", $("<span>"));
  const s2 = withClass("mono", $("<span>"));
  expr.render(s1);
  s2.append(withClass("value", $("<span>", JSON.stringify(expr.evaluate()))));
  where.append(s1);
  where.append($(" ⟹ "));
  where.append(s2);
}

function showFilledExpression(expr, where) {
  const s1 = withClass("mono", $("<span>"));
  const s2 = withClass("mono", $("<span>"));
  expr.render(s1);
  s2.append($(JSON.stringify(expr.evaluate())));
  where.append(s1);
  where.append($(" ⟹ "));
  where.append(s2);
}

function addTile(v) {
  let json = JSON.stringify(v);
  let b = $("<button>", json);
  b.value = json;
  b.onclick = onAnswer;
  $("#answers").append(b);
}

function disableTile(t) {
  t.className = "disabled";
  t.onclick = null;
}

function newAnswer() {
  for (let i = 0; i < 200; i++) {
    let v = g.valueForLevel(model.level);
    let json = JSON.stringify(v);
    if (!(json in model.currentAnswers)) {
      model.currentAnswers[json] = v;
      return v;
    }
  }
  throw Error("Couldn't find an unused value!");
}

document.addEventListener("DOMContentLoaded", init);
