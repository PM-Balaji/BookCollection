import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";


const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

let books=[
    {id: 1, title: "The War of Art", author: "Steven Pressfield",description: "abc"},
    {id: 2, title: "On Writing Well", author: "William Zinsser",description: "difn"}
]

db.connect();

app.get("/", async(req, res) => {
    res.render("home.ejs");
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
  });
  
  app.get("/register", (req, res) => {
    res.render("register.ejs");
  });

app.get("/books", async(req, res) => {
    if (req.isAuthenticated){
        const answer = await db.query("SELECT title, author, description, views, date FROM books JOIN authors ON authors.author_id = books.author_id ORDER BY views DESC");
        books = answer.rows;
        let images = [];
        for(let item of books){
            const result = await axios.get("https://openlibrary.org/search.json?title="+item.title+"&author="+item.author+"&limit=1");
            let isbn_id
            try {
                isbn_id = "https://covers.openlibrary.org/b/isbn/"+result.data.docs[0].isbn[0]+"-M.jpg";
            } catch (err) {
                isbn_id = err;
            }
            images.push(isbn_id);
        }
        res.render("index.ejs",{books: books, images: images,});
        } else {
            res.render("/login");
        }
})

app.get("/create", (req, res) => {
    res.render("create.ejs");
});

app.post("/login",
    passport.authenticate("local", {
        successRedirect: "/books",
        failureRedirect: "/login",
    })
);

app.post("/notes", async(req, res) => {
    const ans = await db.query("SELECT title, author, notes, views FROM books JOIN authors ON authors.author_id = books.author_id WHERE title = $1",[req.body.notes]);
    const lastViewed = new Date().toLocaleDateString();
    const views = ans.rows[0].views + 1;
    await db.query("UPDATE books SET views = $1, date = $2 WHERE title = $3", [views, lastViewed, req.body.notes]);
    const note = ans.rows;
    res.render("notes.ejs", {notes: note[0]});
});

app.post("/create", async(req, res) => {
    // console.log(req.body.author);
    let check = await db.query("SELECT * FROM authors WHERE author = $1", [req.body.author]);
    const result = await db.query("SELECT title FROM books WHERE title = $1", [req.body.title]);
    if (result.rows.length === 0){
        if (check.rows.length === 0) {
            await db.query("INSERT INTO authors (author) Values($1)", [req.body.author]);
            check = await db.query("SELECT * FROM authors WHERE author = $1", [req.body.author]);
        }
        // console.log(check.rows[0].author_id);
        await db.query(
            "INSERT INTO books (title, description, notes, views, author_id) VALUES ($1, $2, $3, $4, $5)", [req.body.title, req.body.content[0], req.body.content[1], 1, check.rows[0].author_id]
        );
        res.redirect("/");
    } else {
        alert("The Book is already Present");
        res.redirect("/");
    }
});

app.post("/edit", async(req, res) => {
    const result = await db.query("SELECT description, notes FROM books WHERE title = $1", [req.body.edit]);
    // console.log(result.rows[0].description);
    res.render("edit.ejs", {title: req.body.edit, description: result.rows[0].description, note: result.rows[0].notes});
});

app.post("/submit", async(req, res) => {
    // console.log(req.body.content[0]);
    await db.query("UPDATE books SET description = $1, notes = $2 where title = $3", [req.body.content[0], req.body.content[1], req.body.title]);
    res.redirect("/");
});

app.post("/delete", async(req, res) => {
    // console.log(req.body);
    await db.query("DELETE FROM books WHERE title = $1", [req.body.delete]);
    res.redirect("/");
});

app.post("/register", async(req, res) => {
    const email = req.body.username;
    const password = req.body.password;
    try{
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        // console.log(checkResult.rows.length);
        if (checkResult.rows.length > 0){
            res.redirect("/login");
        } else{
            bcrypt.hash(password, saltRounds, async(err, hash) => {
                if(err) {
                    console.error("Error hashing password:", err);
                } else{
                    const result = await db.query(
                        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
                        [email, hash]
                      );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log("success");
                        res.redirect("/books");
                      });
                }
            })
        }
    } catch (err) {
        console.log("err");
    }
});

passport.use(
    new Strategy(async function verify(username, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1 ", [username]);
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              //Error with password check
              console.error("Error comparing passwords:", err);
              return cb(err);
            } else {
              if (valid) {
                // console.log("Passed password check");
                return cb(null, user);
              } else {
                //Did not pass password check
                return cb(null, false);
              }
            }
          });
        } else {
          return cb("User not found");
        }
      } catch (err) {
        console.log(err);
      }
    })
  );

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});