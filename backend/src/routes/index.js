const express = require('express');
const router = express.Router();
const Event = require('../models/event');
const User = require('../models/user');
const Singularity = require('../models/singularity');
const socketServer = require('../socket-connection');
const ObjectId = require('mongoose').Types.ObjectId;

async function ensureSingularity(singularity) {
  try {
    await Singularity.create(singularity)
  } catch(e) {
    console.log('this user was previously seen', singularity)
  }
}

async function ensureUser(req, res, next) {
  if (!req.session.user)
    req.session.user = await User.findOneAndUpdate({ sessionId: req.session.id }, { sessionId: req.session.id, computerId: req.session.computerId }, { upsert: true, new: true })

  await ensureSingularity({ userId: req.session.user._id, sessionId: req.session.id, computerId: req.session.computerId })

  next()
}

async function fetchUserIdsBySingularities({sessionId, userId, computerId}) {
  return Singularity.find({
      $or: [
        { sessionId },
        { userId },
        { computerId }
      ]
    }).select('-_id userId').distinct('userId')
}

router.post('/register', async (req, res, next) => {
  req.session.computerId = req.body.computerId
  req.session.user = await User.findOneAndUpdate({ sessionId: req.session.id }, { sessionId: req.session.id, computerId: req.session.computerId }, { upsert: true, new: true })

  await ensureSingularity({ userId: req.session.user._id, sessionId: req.session.id, computerId: req.session.computerId })

  req.session.save()
  res.sendStatus(200)
})

router.get('/', function (req, res, next) {
  res.send('respond with a resource');
});

router.get('/events', ensureUser, async (req, res, next) => {
  let query = { code: new RegExp(`^${req.query.code}$`, 'i') }

  if (ObjectId.isValid(req.query.code)) {
    query = { _id: req.query.code }
  }

  const event = await Event.findOne(query)

  if (!event) return res.send(null)

  res.send(event._id)
})

router.post('/events', async function(req, res, next) {
  const event = new Event({title: 'test event'})
  await event.save()

  res.send(event)
})

router.get('/events/:eventId', async (req, res, next) => {
  let event = await Event.findOne({ _id: req.params.eventId })

  if (!event) return next(new Error('Event not found'))
  try {
    const {
      id: sessionId,
      user: {
        _id: userId
      },
      computerId
    } =  req.session;
    const userIds =  await fetchUserIdsBySingularities({sessionId, userId, computerId})
    event = Event.decorateForUser(event, userIds)
    res.send(event)
  } catch (error) {
    return next(new Error('UserId not found'))
  }
})

router.post('/events/:eventId/questions', ensureUser, async function(req, res, next) {
  if (!req.body.text) return next(new Error('Question cannot be left blank'))

  const event = await Event.findOne({ _id: req.params.eventId })
  if (!event) return next(new Error('Event not found'))
  let userIds;
  try {
    const {
      id: sessionId,
      user: {
        _id: userId
      },
      computerId
    } =  req.session;
    userIds =  await fetchUserIdsBySingularities({sessionId, userId, computerId})
    event.questions.unshift({ text: req.body.text, author: req.body.user, user: userId })
  } catch (error) {
    return next(new Error('UserId not found'))
  }


  try {
    await event.save()

    const { questions } = Event.decorateForUser(event, userIds)

    socketServer().to(req.params.eventId).emit('questions updated', questions)

    res.send(event)
  } catch(e) {
    next(e)
  }
})

router.delete('/events/:eventId/questions/:questionId', async function(req, res, next) {
  let event = await Event.findOne({ _id: req.params.eventId })

  if (!event) return next(new Error('Event not found'))

  try {
    const {
      id: sessionId,
      user: {
        _id: userId
      },
      computerId
    } =  req.session;
    const userIds =  await fetchUserIdsBySingularities({sessionId, userId, computerId})

    const question = event.questions.find(q => userIds.some((i) => i.equals(q.user)) && q._id.equals(req.params.questionId))

    if (!question) return res.sendStatus(404)

    question.remove()
    await event.save()

    const { questions } = Event.decorateForUser(event, userIds)

    socketServer().to(req.params.eventId).emit('questions updated', questions)

    res.sendStatus(200)
  } catch (error) {
    return next(new Error('UserId not found'))
  }

})

router.patch('/events/:eventId/questions/:questionId', ensureUser, async function(req, res, next) {
  const operator = req.body.vote == 'like' ? '$addToSet' : '$pull'

  const update = {
    [operator]: {
      'questions.$.voters': req.session.user._id
    }
  }

  const event = await Event.findOneAndUpdate({
    _id: req.params.eventId
  }, update, { new: true }).elemMatch('questions', {
    _id: req.params.questionId,
    voters: { $nin: singularities.map(s => s.userId) }
  })

  if (!event) return next(new Error('Event or question not found'))

  await event.save()

  try {
    const { questions } = Event.decorateForUser(event, userIds)

    socketServer().to(req.params.eventId).emit('questions updated', questions)

    res.sendStatus(200)
  } catch (error) {
    return next(new Error('UserId not found'))
  }

})

module.exports = router;
