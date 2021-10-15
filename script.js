import { $, clear, withClass } from "./whjqah.js";
import { shuffleArray } from "./shuffle.js";
import { random as g } from "./random.js";
import { Value, Blank, BinaryOp, PrefixOp } from "./expressions.js";

// Basic plan.

// Generate a bunch of random expressions whose complexity is based on
// the current level. (E.g. initially just simple values, maybe of one type;
// later more complex expressions.) These make up the palette for a level.

// Levels (values):
//  0: just numbers
//  1: just strings and numbers for indices.
//  2: just booleans
//  3: numbers and strings
//  4: homogeneous arrays
//  5: numbers, strings, booleans, and homogenous arrays
//  6: add heterogenous arrays but no nesting
//  7: add nested heterogenous arrays
//  8: arithmetic expressions
//  9: string expressions

let all_types = ["number", "string", "boolean", "array"];

function pickASide(blankValue, otherValue, op, okTypes) {
  if (Math.random() < 0.5) {
    return blankOnLeft(blankValue, otherValue, op, okTypes);
  } else {
    return blankOnRight(otherValue, blankValue, op, okTypes);
  }
}

function blankOnLeft(left, right, op, okTypes) {
  return new BinaryOp(
    new Blank(left),
    new Value(right),
    op,
    ops[op].fn,
    okTypes
  );
}

function blankOnRight(left, right, op) {
  return new BinaryOp(
    new Value(left),
    new Blank(right),
    op,
    ops[op].fn,
    okTypes
  );
}

function numeric(op) {
  return (blankValue) => pickASide(blankValue, g.number(), op, ["number"]);
}

function any(op) {
  return (blankValue) => pickASide(blankValue, g.value(), op, all_types);
}

function boolean(op) {
  return (blankValue) => pickASide(blankValue, g.boolean(), op, ["boolean"]);
}

function sameType(op) {
  return (blankValue) => {
    let blankType = type(blankValue);
    pickASide(blankValue, g.valueOf(blankType), op, [blankType]);
  };
}

function prefix(op) {
  return (blankValue) => new PrefixOp(blankValue, op, ops[op].fn, ["boolean"]);
}

function divide(op) {
  return (blankValue) => {
    if (blankValue === 0) {
      return blankOnLeft(blankValue, g.nonZeroNumber(), op, ["number"]);
    } else if (blankValue == 1) {
      return blankOnLeft(blankValue, g.choice([2, 3, 4]), op, ["number"]);
    } else {
      let factors = Array(blankValue)
        .fill()
        .map((_, i) => i)
        .filter((i) => i > 1 && blankValue % i == 0);
      if (factors.length > 0) {
        return blankOnLeft(blankValue, g.choice(fs), op, ["number"]);
      } else {
        return blankOnRight(g.choice([2, 3]) * blankValue, blankValue, op, [
          "number",
        ]);
      }
    }
  };
}

function modulus(op) {
  return (blankValue) => {
    if (blankValue < 2) {
      return blankOnLeft(blankValue, g.nonZeroNumber(), op, ["number"]);
    } else {
      return pickASide(blankValue, g.nonZeroNumber(), op, ["number"]);
    }
  };
}

function index(op) {
  return (blankValue) => {
    let t = type(blankValue);
    if (t === "string" || t === "array") {
      return blankOnLeft(blankValue, g.int(0, blankValue.length), op, [
        "number",
      ]);
    } else {
      // FIXME: move to generator and add possibility of getting array
      let s = "abcdefghijklmnopqrstuvwxyz".substring(
        0,
        Math.floor(blankValue * 1.5)
      );
      return blankOnRight(s, blankValue, op, ["string", "array"]);
    }
  };
}

let operatorsForType = {
  number: ["+", "-", "*", "/", "%", "<", "<=", ">", ">=", "===", "!=="],
  string: ["+", "[]", "===", "!=="],
  boolean: ["&&", "||", "!", "===", "!=="],
  array: ["[]"], //, "===", "!=="],
};

const ops = {
  "+": op((a, b) => a + b, sameType), // matches type
  "-": op((a, b) => a - b, numeric), // number
  "*": op((a, b) => a * b, numeric), // number
  "/": op((a, b) => a / b, divide), // number
  "%": op((a, b) => a % b, modulus), // number
  "<": op((a, b) => a < b, numeric), // number
  "<=": op((a, b) => a <= b, numeric), // number
  ">": op((a, b) => a > b, numeric), // number
  ">=": op((a, b) => a >= b, numeric), // number
  "===": op((a, b) => a === b, any), // any
  "!==": op((a, b) => a !== b, any), // any
  "[]": op((a, b) => a[b], index), // depends on what's filled in
  "&&": op((a, b) => a && b, boolean), // boolean
  "||": op((a, b) => a || b, boolean), // boolean
  "!": op((a) => !a, prefix), // boolean
};

function okTypes(op, nonBlankType) {
  switch (op) {
    case "+":
      return [nonBlankType];

    case "-":
    case "*":
    case "/":
    case "%":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return ["number"];

    case "[]":
      if (nonBlankType == "string" || nonBlankType == "array") {
        return ["number"];
      } else {
        return ["string", "array"];
      }

    case "&&":
    case "||":
    case "!":
      return ["boolean"];

    case "!==":
    case "===":
      return ["number", "string", "boolean", "array"];

    default:
      throw Error("Missing op " + op);
  }
}

function op(fn, constructor) {
  return { fn: fn, constructor: constructor };
}

function forBlank(blankValue) {
  const op = g.choice(operatorsForType[type(blankValue)]);
  return ops[op].constructor(op)(blankValue);
}

// Get the type as far as we are concerned.
function type(value) {
  let t = typeof value;
  switch (t) {
    case "number":
    case "string":
    case "boolean":
      return t;
    default:
      return Array.isArray(value) ? "array" : "unknown";
  }
}

let model = {
  currentAnswers: {},
  level: 3,
};

function init() {
  model.currentAnswers = uniqueAnswers();
  populateAnswers(model.currentAnswers);
  clear($("#results"));
  setQuestion();
}

function populateAnswers(currentAnswers) {
  const answers = Object.keys(currentAnswers);
  shuffleArray(answers);

  const div = $("#answers");
  for (const json of answers) {
    let v = answers[json];
    let b = $("<button>", json);
    b.value = json;
    b.onclick = onAnswer;
    div.append(b);
  }
}

function setQuestion() {
  const answers = Object.values(model.currentAnswers);
  if (answers.length > 0) {
    let a = g.choice(answers);
    let expr = forBlank(a);
    model.currentQuestion = expr;
    showExpression(expr, clear($("#question")));
  } else {
    //model.level++;
    init();
  }
}

function onAnswer(e) {
  const answer = JSON.parse(e.target.value);
  const answered = model.currentQuestion.fillBlank(answer);
  delete model.currentAnswers[e.target.value];
  e.target.parentElement.removeChild(e.target);
  logAnswer(model.currentQuestion, answer);
  setQuestion();
}

function logAnswer(expr, got) {
  // We can't just compare the answer we got to the answer
  // we used to create the question because there could be
  // multiple answers that would get the same result (e.g.
  // consider ? * 0 ==> 0.)

  // Things to check:
  // - Was the selected answer an acceptable type?
  // - Does evaluating the expression with the selected answer yield the same result.
  //
  // The former does not necessarily require that the answer is the same type
  // as the value in the blank--in an === or !== any value is a plausible type.
  // (I'm ignoring the legality of types after coercion so no numbers to && or
  // booleans to +, etc.)
  //

  const typeOk = expr.okTypes.indexOf(type(got)) != -1;
  const withGot = expr.fillBlank(got);
  const valueRight = withGot.evaluate() === expr.evaluate();
  const passed = typeOk && valueRight;

  const row = $("#results").insertRow(0);
  row.className = passed ? "pass" : "fail";
  showExpression(expr, row.insertCell());
  row.insertCell().append(withClass("mono", $("<span>", JSON.stringify(got))));
  const notesCell = row.insertCell();
  const resultCell = row.insertCell();

  if (passed) {
    notesCell.append($("Looks good!"));
    resultCell.append($("✅"));
  } else if (typeOk) {
    notesCell.append(
      $(
        "Value is an ok type for the operator but the value itelf isn't quite right. "
      )
    );
    notesCell.append(withClass("mono", $("<span>", JSON.stringify(inBlank))));
    notesCell.append($(" would have worked"));
    resultCell.append($("❌"));
  } else {
    let expectation;
    if (expr.okTypes.length == 1) {
      expectation = expr.okTypes[0];
    } else {
      expectation = `either ${expr.okTypes[0]} or ${expr.okTypes[1]}`;
    }
    notesCell.append(
      $(`Wrong type of value. Should have been ${expectation}.`)
    );
    resultCell.append($("❌"));
  }
}

function showExpression(expr, where) {
  const s1 = withClass("mono", $("<span>"));
  const s2 = withClass("mono", $("<span>"));
  expr.render(s1);
  s2.append($(JSON.stringify(expr.evaluate())));
  where.append(s1);
  where.append($(" ⟹ "));
  where.append(s2);
}

function uniqueAnswers() {
  let count = 0;
  let iters = 0;
  let answers = {};
  while (count < 20 && iters < 200) {
    let v = g.valueForLevel(model.level);
    let json = JSON.stringify(v);
    if (!(json in answers)) {
      answers[json] = v;
      count++;
    }
    iters++;
  }
  return answers;
}

document.addEventListener("DOMContentLoaded", init);
